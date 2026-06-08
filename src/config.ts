import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  EnvalidocConfig,
  ResolvedConfig,
  UserConfigFile,
} from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import { expandSourceGlobs } from './utils/resolver.js';
import { getModuleIdentifier } from './utils/cjs-bootstrap.js';

/**
 * Type-safe identity function for user config files.
 * Provides editor autocompletion and type checking in the config file.
 */
export function defineConfig(config: UserConfigFile): EnvalidocConfig {
  return config as EnvalidocConfig;
}

const CONFIG_FILE_NAMES = [
  'envalidoc.config.ts',
  'envalidoc.config.js',
  'envalidoc.config.mjs',
] as const;

/**
 * Search for a config file in the given directory, trying each candidate
 * name in priority order. Returns the absolute path of the first match.
 */
function findConfigFile(cwd: string): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const filePath = join(cwd, name);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Load a config file using jiti (handles both TS and JS/ESM).
 * Falls back to dynamic import() for .js/.mjs files if jiti is unavailable.
 */
async function loadConfigFile(configPath: string): Promise<EnvalidocConfig> {
  let mod: Record<string, unknown>;

  try {
    const { createJiti } = await import('jiti');
    const jiti = createJiti(getModuleIdentifier(), { interopDefault: true });
    mod = jiti(configPath) as Record<string, unknown>;
  } catch {
    // jiti not available — fall back to dynamic import for JS files
    if (configPath.endsWith('.ts')) {
      throw new Error(
        'Cannot load TypeScript config without jiti.\n' +
          'Install jiti as a dev dependency: npm install -D jiti',
      );
    }

    const fileUrl = pathToFileURL(resolve(configPath)).href;
    mod = (await import(fileUrl)) as Record<string, unknown>;
  }

  // The config may be the default export or a named export
  const config =
    (mod.default as EnvalidocConfig | undefined) ??
    (mod.envalidocConfig as EnvalidocConfig | undefined);

  if (!config || typeof config !== 'object') {
    throw new Error(
      `Config file "${configPath}" must export a config object (default or named "envalidocConfig").`,
    );
  }

  return config;
}

/**
 * Merge a user-provided config with defaults to produce a fully resolved config.
 */
export function mergeConfig(user: EnvalidocConfig): ResolvedConfig {
  const output = {
    markdown: user.output?.markdown ?? DEFAULT_CONFIG.output.markdown,
    envExample: user.output?.envExample ?? DEFAULT_CONFIG.output.envExample,
    title: user.output?.title ?? DEFAULT_CONFIG.output.title,
  };

  return {
    sources: user.sources,
    output,
    secretPatterns: user.secretPatterns ?? [...DEFAULT_CONFIG.secretPatterns],
    overrides: user.overrides ?? { ...DEFAULT_CONFIG.overrides },
    envFilePath: user.envFilePath ?? DEFAULT_CONFIG.envFilePath,
  };
}

/**
 * Load and resolve the envalidoc configuration.
 *
 * Searches for a config file in `cwd` (defaulting to process.cwd()),
 * merges it with defaults, and validates required fields.
 *
 * @param cwd - Directory to search for config files. Defaults to process.cwd().
 * @param configPath - Optional explicit path to a config file. If provided, auto-discovery is skipped.
 * @returns The fully resolved configuration.
 */
export async function loadConfig(cwd?: string, configPath?: string): Promise<ResolvedConfig> {
  const baseDir = resolve(cwd ?? process.cwd());

  const resolvedConfigPath = configPath 
    ? resolve(baseDir, configPath)
    : findConfigFile(baseDir);
    
  if (!resolvedConfigPath) {
    throw new Error(
      'No envalidoc config file found.\n' +
        'Create one: envalidoc.config.ts, envalidoc.config.js, or envalidoc.config.mjs',
    );
  }

  const userConfig = await loadConfigFile(resolvedConfigPath);

  if (!userConfig.sources || userConfig.sources.length === 0) {
    throw new Error(
      'Config must define at least one source.\n' +
        'Add a "sources" array to your config with paths to your envalid spec files.',
    );
  }

  const merged = mergeConfig(userConfig);

  // Expand glob patterns in sources
  const expandedSources = expandSourceGlobs(merged.sources, baseDir);

  return { ...merged, sources: expandedSources };
}
