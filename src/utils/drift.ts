/**
 * Drift detection: compare .env file against env var specs.
 */

import { readFile } from 'node:fs/promises';
import type { EnvVarSpec, DriftResult, DriftIssue } from '../types.js';
import { parseDotEnv } from './parser.js';

/** Options for drift detection. */
export interface DriftOptions {
  /** Patterns to exclude vars from drift checks (case-insensitive substring match). */
  ignore?: string[];
}

/**
 * Detect drift between the .env file and the declared env var specs.
 *
 * @param specs - Map of env var name to spec
 * @param envFilePath - Path to the .env file to check
 * @param options - Optional drift detection options
 * @returns DriftResult with all issues found
 */
export async function detectDrift(
  specs: Map<string, EnvVarSpec>,
  envFilePath: string,
  options?: DriftOptions,
): Promise<DriftResult> {
  const issues: DriftIssue[] = [];
  const ignorePatterns = options?.ignore ?? [];

  /** Check if a var name should be skipped due to ignore patterns. */
  const isIgnored = (name: string): boolean =>
    ignorePatterns.length > 0 &&
    ignorePatterns.some((p) => name.toUpperCase().includes(p.toUpperCase()));

  let envVars: Map<string, string>;
  try {
    const content = await readFile(envFilePath, 'utf-8');
    envVars = parseDotEnv(content);
  } catch (err) {
    // If the .env file doesn't exist, every required var is missing
    const notFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
    if (notFound) {
      envVars = new Map();
    } else {
      throw err;
    }
  }

  // Check each spec against the .env file
  for (const [name, spec] of specs) {
    if (isIgnored(name)) continue;

    const value = envVars.get(name);

    if (value === undefined) {
      // Variable not present in .env
      if (spec.optional || spec.defaultValue !== undefined) {
        issues.push({
          severity: 'warning',
          type: 'missing-optional',
          message: `"${name}" is defined in spec but not present in ${envFilePath}. ` +
            (spec.defaultValue !== undefined
              ? `Has default: "${spec.defaultValue}".`
              : 'Marked as optional.'),
          varName: name,
        });
      } else {
        issues.push({
          severity: 'error',
          type: 'missing-required',
          message: `"${name}" is required but not present in ${envFilePath}.`,
          varName: name,
        });
      }
      continue;
    }

    // Variable exists — check for secret in dotenv
    if (spec.secret) {
      issues.push({
        severity: 'warning',
        type: 'secret-in-dotenv',
        message: `"${name}" is marked as a secret but has a value in ${envFilePath}. ` +
          'Consider using a secrets manager or .env.local.',
        varName: name,
      });
    }

    // Check type validity
    if (!checkType(value, spec.type)) {
      issues.push({
        severity: 'error',
        type: 'type-mismatch',
        message: `"${name}" has value "${truncate(value, 40)}" which does not match expected type "${spec.type}".`,
        varName: name,
      });
    }
  }

  // Check for extra variables in .env that are not in specs
  for (const name of envVars.keys()) {
    if (isIgnored(name)) continue;
    if (!specs.has(name)) {
      issues.push({
        severity: 'warning',
        type: 'extra-var',
        message: `"${name}" exists in ${envFilePath} but is not defined in any spec.`,
        varName: name,
      });
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === 'error');

  return { issues, hasErrors };
}

/**
 * Validate whether a value is compatible with the given env var type.
 */
function checkType(value: string, type: string): boolean {
  switch (type) {
    case 'num':
      return isNumeric(value);

    case 'port':
      return isPort(value);

    case 'bool':
      return isBool(value);

    case 'url':
      return isUrl(value);

    case 'email':
      return isEmail(value);

    case 'host':
      return isHost(value);

    case 'json':
      return isJson(value);

    case 'jsonObj':
      return isJsonObject(value);

    case 'str':
    case 'custom':
    default:
      // Strings and custom validators always pass structural checks
      return true;
  }
}

function isNumeric(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim());
}

function isPort(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  const port = parseInt(trimmed, 10);
  return port >= 0 && port <= 65535;
}

function isBool(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed === 'true' || trimmed === 'false' || trimmed === '1' || trimmed === '0';
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ||
      url.protocol === 'ftp:' || url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isHost(value: string): boolean {
  const trimmed = value.trim();
  // Simple hostname or IP check
  return /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(trimmed) ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
    trimmed === 'localhost';
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value.trim());
    return true;
  } catch {
    return false;
  }
}

function isJsonObject(value: string): boolean {
  try {
    const parsed = JSON.parse(value.trim());
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen) + '...';
}
