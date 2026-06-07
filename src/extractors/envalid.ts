/**
 * Extractor for envalid spec objects.
 *
 * Resolves a user-defined source path (relative file or package specifier),
 * dynamically imports the module, and extracts EnvVarSpec[] from any
 * recognised spec exports (envSpec, envConfig, env, or default).
 */

import { createRequire } from 'node:module';
import nodePath from 'node:path';
import type { EnvVarSpec, EnvVarType } from '../types.js';
import { SPEC_EXPORT_NAMES } from '../types.js';
import { getModuleIdentifier } from '../utils/cjs-bootstrap.js';

/**
 * Create a require function for resolve() support.
 * In ESM this uses import.meta.url; in CJS the bundled output may not have
 * import.meta.url available, so we fall back to the global require.
 */
const requireFn = (() => {
  try {
    const metaUrl = import.meta.url;
    if (typeof metaUrl === 'string' && metaUrl.length > 0) {
      return createRequire(metaUrl);
    }
  } catch {
    // import.meta not available (CJS)
  }
  return typeof globalThis.require === 'function'
    ? (globalThis.require as NodeRequire)
    : createRequire(process.cwd());
})();

const moduleIdentifier = getModuleIdentifier();

/**
 * Shape of an envalid validator object (envalid >= 8).
 *
 * In envalid v8, validators are plain objects (NOT functions) carrying
 * a `_parse` method and optional spec properties (`desc`, `default`,
 * `devDefault`, `choices`, etc.).
 */
interface EnvalidValidator {
  /** Parse function — the marker that identifies an envalid validator */
  _parse?: unknown;
  desc?: string;
  default?: unknown;
  devDefault?: unknown;
  choices?: readonly string[];
  example?: string;
  docs?: string;
}

/** Anything a module can export for a spec key. */
type SpecValue = EnvalidValidator | object | unknown;

/**
 * A user's envalid spec object — a record keyed by env-var name
 * where each value should be an envalid validator.
 */
type RawSpecRecord = Record<string, SpecValue>;

/**
 * The shape of a dynamically imported module.
 * Named spec exports plus an optional default export.
 */
interface ImportedModule {
  [key: string]: unknown;
  default?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const require = requireFn;

/**
 * Error message patterns used to infer the validator type from
 * envalid's parse error messages. Each validator throws a distinct
 * message containing its type name.
 */
const ERROR_TYPE_PATTERNS: Array<[RegExp, EnvVarType]> = [
  [/bool/i, 'bool'],
  [/port/i, 'port'],
  [/number/i, 'num'],
  [/url/i, 'url'],
  [/email/i, 'email'],
  [/host/i, 'host'],
  [/json/i, 'json'],
  [/str/i, 'str'],
];

/**
 * A probe value that is invalid for most envalid validators.
 * `str` accepts anything, so it won't throw — that's how we detect 'str'.
 */
const TYPE_PROBE_VALUE = 'INVALID_ENVALID_TYPE_PROBE';

/**
 * Determine whether `value` is an envalid validator.
 *
 * Envalid v8 validators are plain objects with a `_parse` method.
 * We check for object type (not null, not array, not function) and
 * the presence of `_parse` as a function.
 */
function isValidator(value: unknown): value is EnvalidValidator {
  if (value == null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v._parse === 'function';
}

/**
 * Resolve a source path to an absolute file path.
 *
 * - If the path starts with '.' or '/' it is treated as a file-system path
 *   and resolved relative to `cwd` (or `process.cwd()`).
 * - Otherwise it is treated as a Node package specifier and resolved via
 *   `require.resolve`.
 */
function resolveSourcePath(sourcePath: string, cwd?: string): string {
  const resolvedCwd = cwd ?? process.cwd();

  // Relative or absolute file path
  if (sourcePath.startsWith('.') || sourcePath.startsWith('/')) {
    const absolute = nodePath.resolve(resolvedCwd, sourcePath);
    return require.resolve(absolute);
  }

  // Package specifier (e.g. '@acme/core/env' or 'my-lib/env')
  return require.resolve(sourcePath, { paths: [resolvedCwd] });
}

/**
 * Detect the EnvVarType from a validator object.
 *
 * Envalid v8 validators don't carry a type/name property, so we infer
 * the type by calling `_parse` with a probe value and examining the
 * result or error message.
 *
 * - `str` accepts any string and returns it unchanged → no error
 * - Other validators reject the probe → error message contains the type name
 */
function detectType(validator: EnvalidValidator): EnvVarType {
  const parse = validator._parse;
  if (typeof parse !== 'function') return 'custom';

  try {
    (parse as Function)(TYPE_PROBE_VALUE);
    // No error → str (accepts any string input)
    return 'str';
  } catch (err) {
    const msg = (err as Error).message ?? '';
    for (const [pattern, type] of ERROR_TYPE_PATTERNS) {
      if (pattern.test(msg)) return type;
    }
    return 'custom';
  }
}

/**
 * Convert a default value to a string suitable for documentation.
 */
function stringify(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return String(value);
}

/** ANSI escape code regex for stripping color codes from envalid output. */
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a module from a resolved file path using jiti.
 *
 * jiti handles TypeScript sources and extensionless imports (e.g. './core')
 * which Node's native `import()` does not support.
 *
 * If the module calls `cleanEnv()` at the top level (common in barrel files),
 * envalid would validate the env and call `process.exit(1)` on missing vars.
 * We intercept `process.exit` to throw instead of exiting, capture the
 * missing-var output, stub them in `process.env`, and retry the import.
 */

/** Sentinel error message used by the process.exit interceptor. */
const EXIT_INTERCEPTED = '__ENVALID_EXIT_INTERCEPTED__';

/**
 * Intercept process.exit so it throws instead of killing the process.
 * Returns a cleanup function that restores the original process.exit.
 */
function interceptProcessExit(): () => void {
  const originalExit = process.exit;
  process.exit = function (_code?: number) {
    throw new Error(EXIT_INTERCEPTED);
  } as typeof process.exit;
  return () => { process.exit = originalExit; };
}

/**
 * Intercept stdout and stderr writes, capturing them into a string buffer.
 * Returns a tuple of [buffer accessor, cleanup function].
 */
function captureOutput(): [
  () => string,
  () => void,
] {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  let captured = '';

  const captor = (...args: unknown[]) => {
    captured += String(args[0] ?? '');
    return true;
  };

  process.stdout.write = captor as typeof process.stdout.write;
  process.stderr.write = captor as typeof process.stderr.write;

  return [
    () => captured,
    () => {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    },
  ];
}

/**
 * Parse missing env var names from captured envalid error output.
 *
 * envalid formats errors as indented lines like:
 *   `  VAR_NAME: Missing required env var ...`
 *
 * @param output - Raw captured output (may contain ANSI codes)
 * @returns Array of uppercase env var names found
 */
function parseMissingVarsFromOutput(output: string): string[] {
  const cleanOutput = output.replace(ANSI_ESCAPE_RE, '');
  const missingVars: string[] = [];
  for (const line of cleanOutput.split('\n')) {
    const match = line.match(/^\s+([A-Z_][A-Z0-9_]*):/);
    if (match?.[1]) missingVars.push(match[1] as string);
  }
  return missingVars;
}

/**
 * Stub a set of env vars in process.env and return a cleanup function
 * that restores the original values (deleting any that didn't exist before).
 */
function stubEnvVars(vars: string[]): () => void {
  const originalEnv = { ...process.env };
  for (const v of vars) {
    process.env[v] = 'envalidator_dummy';
  }
  return () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  };
}

/**
 * Safely import a module, intercepting process.exit and handling retries
 * for modules that call cleanEnv() at the top level.
 */
async function importModule(resolvedPath: string): Promise<ImportedModule> {
  const { createJiti } = await import('jiti');
  const jiti = createJiti(moduleIdentifier, { interopDefault: true });

  const restoreExit = interceptProcessExit();
  const [getOutput, restoreOutput] = captureOutput();

  try {
    return jiti(resolvedPath) as ImportedModule;
  } catch (err: unknown) {
    const isExit = err instanceof Error && err.message === EXIT_INTERCEPTED;
    if (!isExit) throw err;

    // Restore output capture before retry (retry needs clean streams)
    restoreOutput();

    const missingVars = parseMissingVarsFromOutput(getOutput());
    if (missingVars.length === 0) throw err;

    // Stub missing env vars and retry
    const restoreEnv = stubEnvVars(missingVars);
    try {
      const retryJiti = createJiti(moduleIdentifier, { interopDefault: true });
      return retryJiti(resolvedPath) as ImportedModule;
    } finally {
      restoreEnv();
    }
  } finally {
    restoreExit();
    // Restore output if not already restored (success path)
    restoreOutput();
  }
}

/**
 * Find the envalid spec object exported from a module.
 *
 * Checks named exports in priority order (envSpec > envConfig > env),
 * then falls back to the default export if none are found.
 *
 * Returns `null` if no recognisable spec export was found.
 */
function findSpecExport(mod: ImportedModule): RawSpecRecord | null {
  for (const name of SPEC_EXPORT_NAMES) {
    const candidate = mod[name];
    if (candidate != null && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as RawSpecRecord;
    }
  }

  // Try default export
  const def = mod.default;
  if (def != null && typeof def === 'object' && !Array.isArray(def)) {
    return def as RawSpecRecord;
  }

  return null;
}

/**
 * Convert a single envalid validator entry into an EnvVarSpec.
 */
function validatorToSpec(
  name: string,
  validator: EnvalidValidator,
  source: string,
): EnvVarSpec {
  const hasDefault = validator.default !== undefined;
  const hasDevDefault = validator.devDefault !== undefined;

  return {
    name,
    type: detectType(validator),
    description: validator.desc ?? '',
    optional: hasDefault || hasDevDefault,
    secret: false, // callers / config layer apply secret heuristics
    defaultValue: stringify(validator.default),
    choices: validator.choices?.length ? [...validator.choices] : undefined,
    example: validator.example,
    docs: validator.docs,
    source,
  };
}

/**
 * Extract env-var specs from an envalid source module.
 *
 * @param sourcePath - A relative file path (e.g. './src/env.ts') or a
 *   package specifier (e.g. '@acme/core/env').
 * @param cwd - The working directory to resolve relative paths against.
 *   Defaults to `process.cwd()`.
 * @returns An array of EnvVarSpec objects extracted from the module.
 * @throws If the source cannot be resolved or imported, or if no spec
 *   export is found.
 */
export async function extractFromSource(
  sourcePath: string,
  cwd?: string,
): Promise<EnvVarSpec[]> {
  const resolvedPath = resolveSourcePath(sourcePath, cwd);
  const mod = await importModule(resolvedPath);
  const spec = findSpecExport(mod);

  if (spec === null) {
    const exportNames = [...SPEC_EXPORT_NAMES, 'default'].join(', ');
    throw new Error(
      `No envalid spec export found in "${sourcePath}". ` +
        `Expected one of: ${exportNames}`,
    );
  }

  const specs: EnvVarSpec[] = [];

  for (const [key, value] of Object.entries(spec)) {
    if (isValidator(value)) {
      specs.push(validatorToSpec(key, value, resolvedPath));
    }
  }

  return specs;
}
