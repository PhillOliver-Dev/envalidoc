import { describe, it, expect } from 'vitest';
import { parseArgs, shouldFail } from '../cli.js';
import type { DriftResult } from '../types.js';

describe('parseArgs', () => {
  it('parses no arguments', () => {
    const args = parseArgs(['node', 'cli']);
    expect(args.command).toBe(null);
    expect(args.config).toBe(null);
    expect(args.cwd).toBe(null);
    expect(args.envFile).toBe(null);
    expect(args.format).toBe(null);
    expect(args.failLevel).toBe(null);
    expect(args.ignore).toEqual([]);
    expect(args.check).toBe(false);
  });

  it('parses positional command', () => {
    const args = parseArgs(['node', 'cli', 'gen']);
    expect(args.command).toBe('gen');
  });

  it('parses help command', () => {
    const args = parseArgs(['node', 'cli', 'help']);
    expect(args.command).toBe('help');
  });

  it('parses version command', () => {
    const args = parseArgs(['node', 'cli', 'version']);
    expect(args.command).toBe('version');
  });

  it('parses --version flag', () => {
    const args = parseArgs(['node', 'cli', '--version']);
    expect(args.command).toBe('version');
  });

  it('parses -v flag', () => {
    const args = parseArgs(['node', 'cli', '-v']);
    expect(args.command).toBe('version');
  });

  it('parses --config flag', () => {
    const args = parseArgs(['node', 'cli', 'gen', '--config', './custom.config.ts']);
    expect(args.command).toBe('gen');
    expect(args.config).toBe('./custom.config.ts');
  });

  it('parses --cwd flag', () => {
    const args = parseArgs(['node', 'cli', 'gen', '--cwd', '/some/path']);
    expect(args.command).toBe('gen');
    expect(args.cwd).toBe('/some/path');
  });

  it('parses --env-file flag', () => {
    const args = parseArgs(['node', 'cli', 'check', '--env-file', '.env.local']);
    expect(args.command).toBe('check');
    expect(args.envFile).toBe('.env.local');
  });

  it('parses --format flag', () => {
    const args = parseArgs(['node', 'cli', 'check', '--format', 'json']);
    expect(args.command).toBe('check');
    expect(args.format).toBe('json');
  });

  it('parses --fail-level flag', () => {
    const args = parseArgs(['node', 'cli', 'check', '--fail-level', 'warning']);
    expect(args.command).toBe('check');
    expect(args.failLevel).toBe('warning');
  });

  it('parses --ignore flag', () => {
    const args = parseArgs(['node', 'cli', 'check', '--ignore', 'EDITOR', '--ignore', 'PAGER']);
    expect(args.command).toBe('check');
    expect(args.ignore).toEqual(['EDITOR', 'PAGER']);
  });

  it('parses --check flag', () => {
    const args = parseArgs(['node', 'cli', 'gen', '--check']);
    expect(args.command).toBe('gen');
    expect(args.check).toBe(true);
  });

  it('parses multiple flags together', () => {
    const args = parseArgs([
      'node',
      'cli',
      'gen',
      '--cwd',
      '/tmp',
      '--config',
      './config.ts',
      '--check',
    ]);
    expect(args.command).toBe('gen');
    expect(args.cwd).toBe('/tmp');
    expect(args.config).toBe('./config.ts');
    expect(args.check).toBe(true);
  });
});

describe('shouldFail', () => {
  const makeIssue = (severity: 'error' | 'warning' | 'info', varName?: string): DriftResult => ({
    issues: [{ severity, type: 'missing-required', message: 'test', varName }],
    hasErrors: severity === 'error',
  });

  it('returns false when fail-level is off', () => {
    const result = makeIssue('error', 'TEST');
    expect(shouldFail(result, 'off')).toBe(false);
  });

  it('returns false when fail-level is error and there are only warnings', () => {
    const result = makeIssue('warning', 'TEST');
    expect(shouldFail(result, 'error')).toBe(false);
  });

  it('returns true when fail-level is error and there are errors', () => {
    const result = makeIssue('error', 'TEST');
    expect(shouldFail(result, 'error')).toBe(true);
  });

  it('returns true when fail-level is warning and there are errors', () => {
    const result = makeIssue('error', 'TEST');
    expect(shouldFail(result, 'warning')).toBe(true);
  });

  it('returns true when fail-level is warning and there are warnings', () => {
    const result = makeIssue('warning', 'TEST');
    expect(shouldFail(result, 'warning')).toBe(true);
  });

  it('returns true by default when there are errors', () => {
    const result = makeIssue('error', 'TEST');
    expect(shouldFail(result, 'error')).toBe(true);
  });
});