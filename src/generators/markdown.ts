/**
 * Generate ENVIRONMENT.md from extracted env var specs.
 */

import type { EnvVarSpec } from '../types.js';

/**
 * Generate a markdown document describing all environment variables.
 *
 * @param specs - Map of env var name to spec
 * @param title - Document title (used as H1)
 * @returns Markdown string
 */
export function generateMarkdown(specs: Map<string, EnvVarSpec>, title: string): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${title}`);
  lines.push('');

  // Sort variables alphabetically
  const sortedEntries = Array.from(specs.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  if (sortedEntries.length === 0) {
    lines.push('No environment variables defined.');
    lines.push('');
    return lines.join('\n');
  }

  // Table header
  lines.push('| Name | Description | Type | Secret | Optional | Default | Choices |');
  lines.push('|------|-------------|------|--------|----------|---------|---------|');

  // Table rows
  for (const [, spec] of sortedEntries) {
    const name = escapeTableCell(spec.name);
    const description = buildDescription(spec);
    const type = escapeTableCell(spec.type);
    const secret = spec.secret ? 'YES' : '';
    const optional = spec.optional ? 'Yes' : 'No';
    const defaultVal = spec.defaultValue !== undefined ? escapeTableCell(spec.defaultValue) : '';
    const choices = spec.choices?.length ? spec.choices.map(escapeTableCell).join(', ') : '';

    lines.push(`| ${name} | ${description} | ${type} | ${secret} | ${optional} | ${defaultVal} | ${choices} |`);
  }

  lines.push('');

  // Group sources section
  const sources = collectSources(sortedEntries);
  if (sources.length > 0) {
    lines.push('## Sources');
    lines.push('');
    for (const source of sources) {
      lines.push(`- \`${source}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build the description cell, appending the example if available.
 */
function buildDescription(spec: EnvVarSpec): string {
  let desc = escapeTableCell(spec.description || '—');

  if (spec.example !== undefined) {
    desc += ` (example: ${escapeTableCell(spec.example)})`;
  }

  if (spec.docs !== undefined) {
    desc += ` [docs](${spec.docs})`;
  }

  return desc;
}

/**
 * Collect unique source paths from specs, preserving order of first appearance.
 */
function collectSources(entries: Array<[string, EnvVarSpec]>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const [, spec] of entries) {
    if (!seen.has(spec.source)) {
      seen.add(spec.source);
      result.push(spec.source);
    }
  }

  return result;
}

/**
 * Escape pipe characters in table cells.
 */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}
