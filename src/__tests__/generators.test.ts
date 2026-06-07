import { describe, it, expect } from 'vitest';
import { generateMarkdown } from '../generators/markdown.js';
import { generateEnvExample } from '../generators/env-example.js';
import type { EnvVarSpec } from '../types.js';

function makeSpec(overrides: Partial<EnvVarSpec> & Pick<EnvVarSpec, 'name'>): EnvVarSpec {
  return {
    type: 'str',
    description: '',
    optional: false,
    secret: false,
    source: './src/env.ts',
    ...overrides,
  };
}

const sampleSpecs = new Map<string, EnvVarSpec>([
  [
    'DATABASE_URL',
    makeSpec({
      name: 'DATABASE_URL',
      description: 'Postgres connection string',
      type: 'str',
      secret: false,
      optional: false,
      example: 'postgresql://localhost:5432/mydb',
    }),
  ],
  [
    'API_KEY',
    makeSpec({
      name: 'API_KEY',
      description: 'External API authentication key',
      type: 'str',
      secret: true,
      optional: false,
    }),
  ],
  [
    'PORT',
    makeSpec({
      name: 'PORT',
      description: 'Server port',
      type: 'port',
      secret: false,
      optional: true,
      defaultValue: '3000',
    }),
  ],
  [
    'NODE_ENV',
    makeSpec({
      name: 'NODE_ENV',
      description: 'Application environment',
      type: 'str',
      secret: false,
      optional: true,
      defaultValue: 'development',
      choices: ['development', 'test', 'production'],
    }),
  ],
  [
    'REDIS_URL',
    makeSpec({
      name: 'REDIS_URL',
      description: 'Redis connection URL',
      type: 'str',
      secret: false,
      optional: true,
      defaultValue: 'localhost:6379',
      docs: 'https://redis.io/docs/connection/',
    }),
  ],
]);

describe('generateMarkdown', () => {
  it('generates a document with H1 title', () => {
    const md = generateMarkdown(sampleSpecs, 'My Variables');
    expect(md).toContain('# My Variables');
  });

  it('generates a table with correct headers', () => {
    const md = generateMarkdown(sampleSpecs, 'Env Vars');
    expect(md).toContain('| Name | Description | Type | Secret | Optional | Default | Choices |');
  });

  it('includes all variables', () => {
    const md = generateMarkdown(sampleSpecs, 'Env Vars');
    expect(md).toContain('DATABASE_URL');
    expect(md).toContain('API_KEY');
    expect(md).toContain('PORT');
    expect(md).toContain('NODE_ENV');
    expect(md).toContain('REDIS_URL');
  });

  it('marks secrets with YES', () => {
    const md = generateMarkdown(sampleSpecs, 'Env Vars');
    expect(md).toContain('| API_KEY |');
    // API_KEY row should have YES in secret column
    const lines = md.split('\n');
    const apiKeyRow = lines.find((l) => l.includes('API_KEY'));
    expect(apiKeyRow).toBeDefined();
    expect(apiKeyRow).toContain('YES');
  });

  it('shows defaults for optional variables', () => {
    const md = generateMarkdown(sampleSpecs, 'Env Vars');
    expect(md).toContain('3000');
    expect(md).toContain('development');
  });

  it('shows choices for constrained variables', () => {
    const md = generateMarkdown(sampleSpecs, 'Env Vars');
    expect(md).toContain('development, test, production');
  });

  it('includes example values in description', () => {
    const md = generateMarkdown(sampleSpecs, 'Env Vars');
    expect(md).toContain('postgresql://localhost:5432/mydb');
  });

  it('includes docs links', () => {
    const md = generateMarkdown(sampleSpecs, 'Env Vars');
    expect(md).toContain('[docs](https://redis.io/docs/connection/)');
  });

  it('lists sources', () => {
    const md = generateMarkdown(sampleSpecs, 'Env Vars');
    expect(md).toContain('## Sources');
    expect(md).toContain('`./src/env.ts`');
  });

  it('handles empty specs', () => {
    const md = generateMarkdown(new Map(), 'Env Vars');
    expect(md).toContain('No environment variables defined.');
  });

  it('sorts variables alphabetically', () => {
    const md = generateMarkdown(sampleSpecs, 'Env Vars');
    const apiIdx = md.indexOf('API_KEY');
    const dbIdx = md.indexOf('DATABASE_URL');
    const portIdx = md.indexOf('PORT');
    expect(apiIdx).toBeLessThan(dbIdx);
    expect(dbIdx).toBeLessThan(portIdx);
  });

  it('escapes pipe characters in values', () => {
    const specs = new Map<string, EnvVarSpec>([
      [
        'PIPE_VAR',
        makeSpec({
          name: 'PIPE_VAR',
          description: 'Contains | pipe',
          type: 'str',
        }),
      ],
    ]);
    const md = generateMarkdown(specs, 'Env Vars');
    // Should escape the pipe
    expect(md).toContain('Contains \\| pipe');
  });
});

describe('generateEnvExample', () => {
  it('generates dotenv-formatted output', () => {
    const output = generateEnvExample(sampleSpecs);
    expect(output).toContain('DATABASE_URL=');
    expect(output).toContain('API_KEY=');
    expect(output).toContain('PORT=');
  });

  it('uses placeholder for secrets', () => {
    const output = generateEnvExample(sampleSpecs);
    expect(output).toContain('API_KEY=YOUR_API_KEY_HERE');
  });

  it('shows example value when available', () => {
    const output = generateEnvExample(sampleSpecs);
    expect(output).toContain('DATABASE_URL=postgresql://localhost:5432/mydb');
  });

  it('comments out optional variables with defaults', () => {
    const output = generateEnvExample(sampleSpecs);
    // PORT is optional with default 3000 — should be commented out
    const lines = output.split('\n');
    const portLine = lines.find((l) => l.includes('PORT='));
    expect(portLine).toBeDefined();
    expect(portLine?.startsWith('#')).toBe(true);
  });

  it('includes description comments', () => {
    const output = generateEnvExample(sampleSpecs);
    expect(output).toContain('# Postgres connection string');
    expect(output).toContain('# External API authentication key');
  });

  it('includes docs comments', () => {
    const output = generateEnvExample(sampleSpecs);
    expect(output).toContain('# Docs: https://redis.io/docs/connection/');
  });

  it('includes choices comments', () => {
    const output = generateEnvExample(sampleSpecs);
    expect(output).toContain('# Choices: development, test, production');
  });

  it('sorts variables alphabetically', () => {
    const output = generateEnvExample(sampleSpecs);
    const apiIdx = output.indexOf('API_KEY');
    const dbIdx = output.indexOf('DATABASE_URL');
    expect(apiIdx).toBeLessThan(dbIdx);
  });

  it('handles empty specs', () => {
    const output = generateEnvExample(new Map());
    expect(output).toBe('');
  });
});
