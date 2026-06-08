export { generateMarkdown } from './generators/markdown.js';
export { generateEnvExample } from './generators/env-example.js';
export { detectDrift } from './utils/drift.js';
export { loadConfig } from './config.js';
export { defineConfig } from './config.js';
export { mergeConfig } from './config.js';
export { extractFromSource } from './extractors/envalid.js';
export { expandSourceGlobs } from './utils/resolver.js';
export type {
  EnvVarSpec,
  EnvVarType,
  EnvalidocConfig,
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
import { loadConfig, mergeConfig } from './config.js';
import { generateMarkdown } from './generators/markdown.js';
import { generateEnvExample } from './generators/env-example.js';
import { extractFromSource } from './extractors/envalid.js';
import { detectDrift } from './utils/drift.js';
import { expandSourceGlobs } from './utils/resolver.js';
import type { EnvalidocConfig, EnvVarSpec, DriftResult } from './types.js';

/**
 * Extract specs from all configured sources, apply secret detection,
 * and apply user overrides. Errors on individual sources are collected
 * rather than thrown, so a single broken file doesn't block everything.
 *
 * @returns A deduplicated Map of env var name to EnvVarSpec, plus any
 *   warnings from sources that failed to load.
 */
export async function extractAllSpecs(
  sources: string[],
  secretPatterns: string[],
  overrides: Record<string, Partial<Pick<EnvVarSpec, 'secret' | 'description' | 'example'>>>,
  cwd?: string,
): Promise<{ specs: Map<string, EnvVarSpec>; warnings: string[] }> {
  const baseDir = cwd ?? process.cwd();
  const specs = new Map<string, EnvVarSpec>();
  const warnings: string[] = [];

  for (const source of sources) {
    try {
      const extracted = await extractFromSource(source, baseDir);
      for (const spec of extracted) {
        specs.set(spec.name, spec);
      }
    } catch (err) {
      warnings.push(
        `Failed to extract specs from "${source}": ${(err as Error).message}`,
      );
    }
  }

  // Apply secret detection (immutable — creates new objects)
  for (const [name, spec] of specs) {
    if (!spec.secret && secretPatterns.length > 0) {
      const upperName = spec.name.toUpperCase();
      const isSecret = secretPatterns.some((p) =>
        upperName.includes(p.toUpperCase()),
      );
      if (isSecret) {
        specs.set(name, { ...spec, secret: true });
      }
    }
  }

  // Apply user overrides (immutable)
  for (const [name, override] of Object.entries(overrides)) {
    const spec = specs.get(name);
    if (spec) {
      const updated = { ...spec };
      if (override.secret !== undefined) updated.secret = override.secret;
      if (override.description !== undefined) updated.description = override.description;
      if (override.example !== undefined) updated.example = override.example;
      specs.set(name, updated);
    }
  }

  return { specs, warnings };
}

/**
 * Main orchestration function.
 *
 * 1. Loads config (if not provided)
 * 2. Extracts specs from all configured sources
 * 3. Applies secret detection and user overrides
 * 4. Generates markdown and .env.example, writes to disk
 * 5. Returns the specs and drift result
 *
 * @param config - Optional pre-loaded config. If omitted, auto-discovers and loads.
 * @param cwd - Optional working directory. Used for resolving paths.
 * @returns The extracted specs and drift detection result.
 */
export async function run(
  config?: EnvalidocConfig,
  cwd?: string,
): Promise<{ specs: Map<string, EnvVarSpec>; drift: DriftResult | null; warnings: string[] }> {
  const baseDir = cwd ?? process.cwd();
  
  const resolved = config
    ? { ...mergeConfig(config), sources: expandSourceGlobs(config.sources, baseDir) }
    : await loadConfig(baseDir);

  // Extract specs, apply secrets + overrides
  const { specs, warnings } = await extractAllSpecs(
    resolved.sources,
    resolved.secretPatterns,
    resolved.overrides,
    baseDir,
  );

  // Generate and write files
  const mdPath = resolve(baseDir, resolved.output.markdown);
  const envPath = resolve(baseDir, resolved.output.envExample);

  const markdown = generateMarkdown(specs, resolved.output.title);
  writeFileSync(mdPath, markdown);

  const envExample = generateEnvExample(specs);
  writeFileSync(envPath, envExample);

  // Run drift detection
  const envFilePath = resolve(baseDir, resolved.envFilePath);
  const drift = await detectDrift(specs, envFilePath);

  return { specs, drift, warnings };
}
