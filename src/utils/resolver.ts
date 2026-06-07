/**
 * Module resolution utility.
 *
 * Resolves source path strings to absolute file paths for dynamic import.
 * Handles relative paths, package specifiers, and glob patterns.
 */

import { createRequire } from 'node:module';
import { accessSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { globSync } from 'glob';

const EXTENSIONS = ['.ts', '.js'] as const;
const INDEX_SUFFIXES = ['/index.ts', '/index.js'] as const;

/**
 * Characters that indicate a path is likely a glob pattern.
 * We use a conservative heuristic to avoid false positives on
 * legitimate package specifiers or file paths.
 */
const GLOB_CHARS = '*?[]{}!+@';

/**
 * Check whether a source path looks like a glob pattern.
 *
 * Only relative/absolute paths can be globs. Package specifiers
 * like `@acme/core/env` are never treated as globs.
 */
function isGlobPattern(sourcePath: string): boolean {
  // Only relative or absolute paths can be globs
  if (!sourcePath.startsWith('.') && !sourcePath.startsWith('/')) {
    return false;
  }
  return GLOB_CHARS.split('').some((ch) => sourcePath.includes(ch));
}

/**
 * Expand a glob pattern into an array of matching file paths.
 * Non-glob paths return `[sourcePath]` unchanged.
 */
export function expandSourceGlobs(sources: string[], cwd: string): string[] {
  const result: string[] = [];

  for (const source of sources) {
    if (isGlobPattern(source)) {
      const matches = globSync(source, {
        cwd,
        absolute: true,
        nodir: true,
      });
      if (matches.length === 0) {
        throw new Error(
          `Glob pattern "${source}" matched no files in "${cwd}".`,
        );
      }
      for (const match of matches) {
        result.push(match);
      }
    } else {
      result.push(source);
    }
  }

  return result;
}

/**
 * Resolve a source path to an absolute file path for dynamic import.
 *
 * - Relative paths (./src/env.ts): resolved from cwd, tries the literal path,
 *   then with extensions appended, then index files.
 * - Package specifiers (@scope/pkg/path): resolved via require.resolve from cwd.
 *
 * @throws {Error} if the path cannot be resolved
 */
export function resolveSourcePath(sourcePath: string, cwd: string): string {
  if (sourcePath.startsWith('.') || sourcePath.startsWith('/')) {
    return resolveRelativeSource(sourcePath, cwd);
  }

  // Package specifier — use Node's require.resolve from the given cwd
  const requireFromCwd = createRequire(join(cwd, 'noop.js'));
  try {
    return requireFromCwd.resolve(sourcePath);
  } catch {
    throw new Error(
      `Cannot resolve package specifier "${sourcePath}" from "${cwd}". ` +
        `Ensure the package is installed and the subpath export exists.`
    );
  }
}

/**
 * Try to resolve a relative source path to an existing file.
 */
function resolveRelativeSource(sourcePath: string, cwd: string): string {
  const fromCwd = resolve(cwd, sourcePath);

  // Try the literal path first
  if (hasFileExtension(sourcePath) && fileExists(fromCwd)) {
    return fromCwd;
  }

  // Try appending extensions
  for (const ext of EXTENSIONS) {
    const candidate = fromCwd + ext;
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  // Try index files
  for (const suffix of INDEX_SUFFIXES) {
    const candidate = fromCwd + suffix;
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  // If it already has an extension but doesn't exist, report that specifically
  if (hasFileExtension(sourcePath)) {
    throw new Error(
      `Source file not found: "${fromCwd}" (resolved from "${cwd}" + "${sourcePath}")`
    );
  }

  throw new Error(
    `Cannot resolve source path "${sourcePath}" from "${cwd}". ` +
      `Tried: ${fromCwd}${EXTENSIONS.map((e) => e).join(', ')} and index files.`
  );
}

/**
 * Check if a path already has a recognized file extension.
 */
function hasFileExtension(p: string): boolean {
  const ext = extname(p).toLowerCase();
  return ext === '.ts' || ext === '.js' || ext === '.mjs' || ext === '.cjs';
}

/**
 * Synchronous file existence check.
 */
function fileExists(p: string): boolean {
  try {
    accessSync(p);
    return true;
  } catch {
    return false;
  }
}
