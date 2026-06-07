import { describe, it, expect } from 'vitest';
import { parseDotEnv } from '../utils/parser.js';

describe('parseDotEnv', () => {
  it('parses simple key=value pairs', () => {
    const input = 'FOO=bar\nBAZ=qux';
    const result = parseDotEnv(input);
    expect(result.get('FOO')).toBe('bar');
    expect(result.get('BAZ')).toBe('qux');
  });

  it('ignores comment lines', () => {
    const input = '# This is a comment\nFOO=bar\n// Also a comment\nBAZ=qux';
    const result = parseDotEnv(input);
    expect(result.size).toBe(2);
    expect(result.get('FOO')).toBe('bar');
    expect(result.get('BAZ')).toBe('qux');
  });

  it('ignores empty lines', () => {
    const input = '\n\nFOO=bar\n\n\nBAZ=qux\n\n';
    const result = parseDotEnv(input);
    expect(result.size).toBe(2);
  });

  it('parses double-quoted values', () => {
    const input = 'FOO="bar baz"';
    const result = parseDotEnv(input);
    expect(result.get('FOO')).toBe('bar baz');
  });

  it('parses single-quoted values', () => {
    const input = "FOO='bar baz'";
    const result = parseDotEnv(input);
    expect(result.get('FOO')).toBe('bar baz');
  });

  it('handles values with equals signs', () => {
    const input = 'DATABASE_URL=postgresql://user:pass@localhost:5432/db';
    const result = parseDotEnv(input);
    expect(result.get('DATABASE_URL')).toBe('postgresql://user:pass@localhost:5432/db');
  });

  it('strips inline comments for unquoted values', () => {
    const input = 'FOO=bar # this is a comment';
    const result = parseDotEnv(input);
    expect(result.get('FOO')).toBe('bar');
  });

  it('keeps spaces in quoted values', () => {
    const input = 'FOO="  bar  "';
    const result = parseDotEnv(input);
    expect(result.get('FOO')).toBe('  bar  ');
  });

  it('handles empty values', () => {
    const input = 'FOO=';
    const result = parseDotEnv(input);
    expect(result.get('FOO')).toBe('');
  });

  it('skips values without assignment', () => {
    const input = 'FOO';
    const result = parseDotEnv(input);
    expect(result.get('FOO')).toBeUndefined();
  });

  it('returns empty map for empty input', () => {
    const result = parseDotEnv('');
    expect(result.size).toBe(0);
  });

  it('handles multi-word values', () => {
    const input = 'MESSAGE=hello world';
    const result = parseDotEnv(input);
    expect(result.get('MESSAGE')).toBe('hello world');
  });
});
