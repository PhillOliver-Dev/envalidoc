import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { detectDrift } from '../utils/drift.js';
import type { EnvVarSpec } from '../types.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const TEST_DIR = resolve(__dirname, '__test_envs__');

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

function specs(): Map<string, EnvVarSpec> {
  return new Map<string, EnvVarSpec>([
    [
      'DATABASE_URL',
      makeSpec({ name: 'DATABASE_URL', description: 'Postgres URL', type: 'str' }),
    ],
    [
      'PORT',
      makeSpec({
        name: 'PORT',
        description: 'Server port',
        type: 'port',
        optional: true,
        defaultValue: '3000',
      }),
    ],
    [
      'API_KEY',
      makeSpec({ name: 'API_KEY', description: 'API key', type: 'str', secret: true }),
    ],
    [
      'DEBUG',
      makeSpec({
        name: 'DEBUG',
        description: 'Debug mode',
        type: 'bool',
        optional: true,
        defaultValue: 'false',
      }),
    ],
    [
      'NODE_ENV',
      makeSpec({
        name: 'NODE_ENV',
        description: 'Environment',
        type: 'str',
        optional: true,
        defaultValue: 'development',
        choices: ['development', 'test', 'production'],
      }),
    ],
  ]);
}

describe('detectDrift', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('reports missing required variables', async () => {
    const envPath = join(TEST_DIR, 'missing-required.env');
    writeFileSync(envPath, 'PORT=3000\n');
    const result = await detectDrift(specs(), envPath);
    expect(result.hasErrors).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'missing-required', varName: 'DATABASE_URL' }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'missing-required', varName: 'API_KEY' }),
    );
  });

  it('reports missing optional variables as warnings', async () => {
    const envPath = join(TEST_DIR, 'missing-optional.env');
    writeFileSync(envPath, 'DATABASE_URL=postgres://localhost/db\nAPI_KEY=secret\n');
    const result = await detectDrift(specs(), envPath);
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'missing-optional', varName: 'DEBUG' }),
    );
  });

  it('reports extra variables as warnings', async () => {
    const envPath = join(TEST_DIR, 'extra-vars.env');
    writeFileSync(envPath, 'DATABASE_URL=postgres://localhost/db\nAPI_KEY=secret\nORPHAN_VAR=yes\n');
    const result = await detectDrift(specs(), envPath);
    expect(result.hasErrors).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'extra-var', varName: 'ORPHAN_VAR' }),
    );
  });

  it('detects secret values in dotenv', async () => {
    const envPath = join(TEST_DIR, 'secret-in-env.env');
    writeFileSync(envPath, 'DATABASE_URL=postgres://localhost/db\nAPI_KEY=my-secret-key\n');
    const result = await detectDrift(specs(), envPath);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'secret-in-dotenv', varName: 'API_KEY' }),
    );
  });

  it('detects type mismatches', async () => {
    const envPath = join(TEST_DIR, 'type-mismatch.env');
    writeFileSync(envPath, 'DATABASE_URL=postgres://localhost/db\nAPI_KEY=key\nPORT=not-a-number\nDEBUG=yes-its-true\n');
    const result = await detectDrift(specs(), envPath);
    expect(result.hasErrors).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'type-mismatch', varName: 'PORT' }),
    );
  });

  it('returns no issues when everything is in sync', async () => {
    const envPath = join(TEST_DIR, 'sync.env');
    writeFileSync(
      envPath,
      'DATABASE_URL=postgres://localhost/db\nAPI_KEY=key\nPORT=3000\nDEBUG=true\nNODE_ENV=production\n',
    );
    const result = await detectDrift(specs(), envPath);
    // No errors, only the secret-in-dotenv warning for API_KEY
    expect(result.hasErrors).toBe(false);
    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('handles missing .env file gracefully', async () => {
    const envPath = join(TEST_DIR, 'nonexistent.env');
    const result = await detectDrift(specs(), envPath);
    expect(result.hasErrors).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ type: 'missing-required' }),
    );
  });
});
