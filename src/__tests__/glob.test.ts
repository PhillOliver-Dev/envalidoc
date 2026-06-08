import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { expandSourceGlobs } from '../utils/resolver.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// Use OS temp dir so vitest's file watcher doesn't pick up our test fixtures
const TEST_DIR = resolve(tmpdir(), `envalidoc-glob-test-${randomUUID()}`);

describe('expandSourceGlobs', () => {
  beforeAll(() => {
    mkdirSync(join(TEST_DIR, 'packages', 'core', 'src'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'packages', 'api', 'src'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'packages', 'web', 'src'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true });

    // Create dummy env spec files
    writeFileSync(join(TEST_DIR, 'packages', 'core', 'src', 'env.ts'), '');
    writeFileSync(join(TEST_DIR, 'packages', 'api', 'src', 'env.ts'), '');
    writeFileSync(join(TEST_DIR, 'packages', 'web', 'src', 'env.ts'), '');
    writeFileSync(join(TEST_DIR, 'src', 'env.ts'), '');
    writeFileSync(join(TEST_DIR, 'src', 'env.test.ts'), '');
    writeFileSync(join(TEST_DIR, 'src', 'other.ts'), '');
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('passes non-glob paths through unchanged', () => {
    const result = expandSourceGlobs(['./src/env.ts'], TEST_DIR);
    expect(result).toEqual(['./src/env.ts']);
  });

  it('passes package specifiers through unchanged', () => {
    const result = expandSourceGlobs(['@acme/core/env'], TEST_DIR);
    expect(result).toEqual(['@acme/core/env']);
  });

  it('expands a single * glob', () => {
    const result = expandSourceGlobs(['./packages/*/src/env.ts'], TEST_DIR);
    expect(result).toHaveLength(3);
    for (const path of result) {
      expect(path).toMatch(/packages\/(core|api|web)\/src\/env\.ts$/);
    }
  });

  it('expands a glob with character-class patterns', () => {
    const result = expandSourceGlobs(['./src/env.*.ts'], TEST_DIR);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/env\.test\.ts$/);
  });

  it('expands a glob with ** (globstar)', () => {
    const result = expandSourceGlobs(['./packages/**/env.ts'], TEST_DIR);
    expect(result).toHaveLength(3);
  });

  it('handles mixed glob and non-glob sources', () => {
    const result = expandSourceGlobs([
      '@acme/shared/env',
      './packages/*/src/env.ts',
      './src/env.ts',
    ], TEST_DIR);
    expect(result).toHaveLength(5); // 1 package + 3 glob matches + 1 file
    expect(result[0]).toBe('@acme/shared/env');
    expect(result[result.length - 1]).toBe('./src/env.ts');
  });

  it('throws for a glob that matches no files', () => {
    expect(() =>
      expandSourceGlobs(['./nonexistent/**/*.ts'], TEST_DIR)
    ).toThrow('matched no files');
  });

  it('returns absolute paths for glob matches', () => {
    const result = expandSourceGlobs(['./src/env.ts'], TEST_DIR);
    // Non-glob paths are passed through as-is
    expect(result[0]).toBe('./src/env.ts');
  });

  it('handles empty sources array', () => {
    const result = expandSourceGlobs([], TEST_DIR);
    expect(result).toEqual([]);
  });
});
