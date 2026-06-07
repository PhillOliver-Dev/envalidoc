export { generateMarkdown } from './generators/markdown.js';
export { generateEnvExample } from './generators/env-example.js';
export { detectDrift } from './utils/drift.js';
export { loadConfig } from './config.js';
export { defineConfig } from './config.js';
export { extractFromSource } from './extractors/envalid.js';
export { expandSourceGlobs } from './utils/resolver.js';
export type {
  EnvVarSpec,
  EnvVarType,
  EnvalidatorConfig,
  DriftResult,
  DriftIssue,
  ResolvedConfig,
  OutputConfig,
  UserConfigFile,
  ExtractedSpecs,
  DriftSeverity,
  DriftType,
} from './types.js';
export { SPEC_EXPORT_NAMES, DEFAULT_SECRET_PATTERNS, DEFAULT_CONFIG } from './types.js';

import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { loadConfig } from './config.js';
import { generateMarkdown } from './generators/markdown.js';
import { generateEnvExample } from './generators/env-example.js';
import { extractFromSource } from './extractors/envalid.js';
import { detectDrift } from './utils/drift.js';
import { expandSourceGlobs } from './utils/resolver.js';
import type { EnvalidatorConfig, EnvVarSpec, ResolvedConfig, DriftResult } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

/**
 * Extract specs from all configured sources, apply secret detection,
 * and apply user overrides.
 *
 * This is the shared core logic used by both the programmatic API (`run`)
 * and the CLI.
 *
 * @param sources - Resolved list of source file paths
 * @param secretPatterns - Patterns for auto-detecting secret variables
 * @param overrides - User-defined overrides for specific variables
 * @returns A deduplicated Map of env var name → EnvVarSpec
 */
export async function extractAllSpecs(
  sources: string[],
  secretPatterns: string[],
  overrides: Record<string, Partial<Pick<EnvVarSpec, 'secret' | 'description' | 'example'>>>,
): Promise<Map<string, EnvVarSpec>> {
  // Extract specs from all sources (last source wins for duplicates)
  const specs = new Map<string, EnvVarSpec>();
  for (const source of sources) {
    const extracted = await extractFromSource(source);
    for (const spec of extracted) {
      specs.set(spec.name, spec);
    }
  }

  // Apply secret detection
  for (const spec of specs.values()) {
    if (!spec.secret && secretPatterns.length > 0) {
      const upperName = spec.name.toUpperCase();
      spec.secret = secretPatterns.some((p) =>
        upperName.includes(p.toUpperCase()),
      );
    }
  }

  // Apply user overrides
  for (const [name, override] of Object.entries(overrides)) {
    const spec = specs.get(name);
    if (spec) {
      if (override.secret !== undefined) spec.secret = override.secret;
      if (override.description !== undefined) spec.description = override.description;
      if (override.example !== undefined) spec.example = override.example;
    }
  }

  return specs;
}

/**
 * Main orchestration function.
 *
 * 1. Loads config (if not provided)
 * 2. Extracts specs from all configured sources
 * 3. Applies secret detection and user overrides
 * 4. Deduplicates (merge vars with same name, last source wins)
 * 5. Generates markdown and .env.example, writes to disk
 * 6. Returns the specs and drift result
 *
 * @param config - Optional pre-loaded config. If omitted, auto-discovers and loads.
 * @returns The extracted specs and drift detection result.
 */
export async function run(
  config?: EnvalidatorConfig,
): Promise<{ specs: Map<string, EnvVarSpec>; drift: DriftResult | null }> {
  const resolved = config
    ? resolveConfig(config)
    : await loadConfig();

  // Extract specs, apply secrets + overrides
  const specs = await extractAllSpecs(
    resolved.sources,
    resolved.secretPatterns,
    resolved.overrides,
  );

  // Generate and write files
  const baseDir = process.cwd();
  const mdPath = resolve(baseDir, resolved.output.markdown);
  const envPath = resolve(baseDir, resolved.output.envExample);

  const markdown = generateMarkdown(specs, resolved.output.title);
  writeFileSync(mdPath, markdown);

  const envExample = generateEnvExample(specs);
  writeFileSync(envPath, envExample);

  // Run drift detection
  const envFilePath = resolve(baseDir, resolved.envFilePath);
  const drift = await detectDrift(specs, envFilePath);

  return { specs, drift };
}

/**
 * Resolve a raw user config into a fully resolved config.
 */
function resolveConfig(config: EnvalidatorConfig): ResolvedConfig {
  return {
    sources: expandSourceGlobs(config.sources, process.cwd()),
    output: {
      markdown: config.output?.markdown ?? './ENVIRONMENT.md',
      envExample: config.output?.envExample ?? './.env.example',
      title: config.output?.title ?? 'Environment Variables',
    },
    secretPatterns: config.secretPatterns ?? [...DEFAULT_CONFIG.secretPatterns],
    overrides: config.overrides ?? {},
    envFilePath: config.envFilePath ?? '.env',
  };
}
