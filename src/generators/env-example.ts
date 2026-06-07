/**
 * Generate .env.example from extracted env var specs.
 */

import type { EnvVarSpec } from '../types.js';

/**
 * Generate a dotenv-formatted .env.example string.
 *
 * @param specs - Map of env var name to spec
 * @returns The .env.example file content
 */
export function generateEnvExample(specs: Map<string, EnvVarSpec>): string {
  const lines: string[] = [];

  // Sort variables alphabetically
  const sortedEntries = Array.from(specs.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  for (const [, spec] of sortedEntries) {
    // Description comment
    if (spec.description) {
      lines.push(`# ${spec.description}`);
    }

    // Docs link comment
    if (spec.docs) {
      lines.push(`# Docs: ${spec.docs}`);
    }

    // Choices comment
    if (spec.choices?.length) {
      lines.push(`# Choices: ${spec.choices.join(', ')}`);
    }

    // Determine the value
    const value = resolveExampleValue(spec);

    if (spec.optional && spec.defaultValue !== undefined) {
      lines.push(`# ${spec.name}=${value}`);
    } else {
      lines.push(`${spec.name}=${value}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Determine the placeholder value for a variable in .env.example.
 */
function resolveExampleValue(spec: EnvVarSpec): string {
  // Secrets get a placeholder to avoid real values
  if (spec.secret) {
    return `YOUR_${spec.name}_HERE`;
  }

  // Prefer example over default
  if (spec.example !== undefined) {
    return spec.example;
  }

  if (spec.defaultValue !== undefined) {
    return spec.defaultValue;
  }

  return '';
}
