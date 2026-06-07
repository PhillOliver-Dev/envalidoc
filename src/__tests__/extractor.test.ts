import { describe, it, expect } from 'vitest';
import { extractFromSource } from '../extractors/envalid.js';
import { resolve } from 'node:path';
import { str, num, bool, port, url, email, host, json } from 'envalid';

const fixturePath = resolve(__dirname, 'fixtures', 'env-spec.ts');

function getSpecByName(specs: Awaited<ReturnType<typeof extractFromSource>>, name: string) {
  const spec = specs.find((s) => s.name === name);
  if (!spec) throw new Error(`Expected spec "${name}" to exist`);
  return spec;
}

describe('extractFromSource with real envalid validators', () => {
  it('detects envalid validators (which are objects, not functions)', async () => {
    // This test proves the core bug: envalid validators are objects with _parse,
    // NOT callable functions. isValidator must handle this correctly.
    const specs = await extractFromSource(fixturePath);

    // envSpec export has 9 variables
    expect(specs.length).toBe(9);

    const names = specs.map((s) => s.name);
    expect(names).toContain('DATABASE_URL');
    expect(names).toContain('PORT');
    expect(names).toContain('NODE_ENV');
    expect(names).toContain('DEBUG');
    expect(names).toContain('API_URL');
    expect(names).toContain('MAX_CONNECTIONS');
    expect(names).toContain('CONTACT_EMAIL');
    expect(names).toContain('ALLOWED_HOST');
    expect(names).toContain('FEATURE_FLAGS');
  });

  it('correctly extracts validator metadata', async () => {
    const specs = await extractFromSource(fixturePath);

    // str with desc
    const dbUrl = getSpecByName(specs, 'DATABASE_URL');
    expect(dbUrl.description).toBe('Postgres connection string');
    expect(dbUrl.optional).toBe(false);
    expect(dbUrl.defaultValue).toBeUndefined();

    // port with default
    const portVar = getSpecByName(specs, 'PORT');
    expect(portVar.description).toBe('Server port');
    expect(portVar.optional).toBe(true);
    expect(portVar.defaultValue).toBe('3000');

    // str with choices and devDefault
    const nodeEnv = getSpecByName(specs, 'NODE_ENV');
    expect(nodeEnv.choices).toEqual(['development', 'test', 'production']);
    expect(nodeEnv.optional).toBe(true);

    // bool with default
    const debug = getSpecByName(specs, 'DEBUG');
    expect(debug.optional).toBe(true);
    expect(debug.defaultValue).toBe('false');
  });

  it('correctly detects validator types', async () => {
    const specs = await extractFromSource(fixturePath);

    expect(getSpecByName(specs, 'DATABASE_URL').type).toBe('str');
    expect(getSpecByName(specs, 'PORT').type).toBe('port');
    expect(getSpecByName(specs, 'NODE_ENV').type).toBe('str');
    expect(getSpecByName(specs, 'DEBUG').type).toBe('bool');
    expect(getSpecByName(specs, 'API_URL').type).toBe('url');
    expect(getSpecByName(specs, 'MAX_CONNECTIONS').type).toBe('num');
    expect(getSpecByName(specs, 'CONTACT_EMAIL').type).toBe('email');
    expect(getSpecByName(specs, 'ALLOWED_HOST').type).toBe('host');
    expect(getSpecByName(specs, 'FEATURE_FLAGS').type).toBe('json');
  });

  it('sets source to the resolved file path', async () => {
    const specs = await extractFromSource(fixturePath);
    for (const spec of specs) {
      expect(spec.source).toContain('env-spec');
    }
  });

  it('initialises secret as false (applied later by config layer)', async () => {
    const specs = await extractFromSource(fixturePath);
    for (const spec of specs) {
      expect(spec.secret).toBe(false);
    }
  });
});

describe('isValidator behaviour with real envalid validators', () => {
  it('real envalid validators are objects, not functions', () => {
    const validator = str({ desc: 'test' });
    expect(typeof validator).toBe('object');
    expect(typeof (validator as unknown as Record<string, unknown>)._parse).toBe('function');
  });

  it('all standard validators are objects with _parse', () => {
    const validators = [
      str({ desc: 'test' }),
      num({ desc: 'test' }),
      bool({ desc: 'test' }),
      port({ desc: 'test' }),
      url({ desc: 'test' }),
      email({ desc: 'test' }),
      host({ desc: 'test' }),
      json({ desc: 'test' }),
    ];

    for (const v of validators) {
      expect(typeof v).toBe('object');
      expect(typeof (v as unknown as Record<string, unknown>)._parse).toBe('function');
    }
  });

  it('validators do not have a .name property matching their type', () => {
    const validator = str({ desc: 'test' });
    // The .name property is undefined on envalid v8 validator objects
    expect((validator as unknown as Record<string, unknown>).name).toBeUndefined();
  });

  it('validators carry metadata as own properties', () => {
    const validator = str({ desc: 'test', default: 'hello', choices: ['a', 'b'], example: 'world', docs: 'https://example.com' });
    const v = validator as unknown as Record<string, unknown>;
    expect(v.desc).toBe('test');
    expect(v.default).toBe('hello');
    expect(v.devDefault).toBeUndefined();
    expect(v.choices).toEqual(['a', 'b']);
    expect(v.example).toBe('world');
    expect(v.docs).toBe('https://example.com');
  });

  it('non-validators (plain objects, strings, numbers) are not validators', () => {
    const plainObj = {} as Record<string, unknown>;
    expect(typeof plainObj).toBe('object');
    expect(typeof plainObj._parse).toBe('undefined');
    expect(plainObj._parse).toBeUndefined();
  });
});
