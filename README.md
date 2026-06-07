# Envalidator

Generate `ENVIRONMENT.md` and `.env.example` from your **envalid** specs. Detect drift between your `.env` and your code.

## Why

Your envalid schema is the source of truth for your environment variables. But documentation inevitably drifts. Envalidator reads your actual envalid spec objects and generates accurate, type-aware documentation — no guessing, no manual upkeep.

## Features

- **Reads envalid specs** — imports your modules and extracts validator metadata (type, description, defaults, choices)
- **Secret detection** — automatically flags vars matching patterns like `KEY`, `SECRET`, `TOKEN`, `PASSWORD`
- **Explicit overrides** — force-mark specific vars as secret or override descriptions via config
- **Multi-format output** — generates both `ENVIRONMENT.md` (markdown table) and `.env.example`
- **Drift detection** — CI-friendly check that catches missing vars, extra vars, type mismatches, and secrets in `.env`
- **Multi-source** — point at local files or dependency packages (e.g. `@acme/core/env`)
- **Glob patterns** — use wildcards for monorepos (e.g. `./packages/*/src/env.ts`)
- **Works with JS and TS** — load config from `.ts` or `.js` files

## Install

```bash
npm install -D envalidator
```

Requires `envalid >= 7.0.0` as a peer dependency.

## Setup

### 1. Export your envalid spec

Separate the spec from `cleanEnv` so envalidator can import it without triggering validation:

```ts
// src/env.ts
import { cleanEnv, str, port, bool } from 'envalid';

// Export this — envalidator will read it
export const envSpec = {
  NODE_ENV: str({
    choices: ['development', 'test', 'production'],
    desc: 'Application environment',
    devDefault: 'development',
  }),
  PORT: port({
    desc: 'Server port',
    default: 3000,
  }),
  DATABASE_URL: str({
    desc: 'PostgreSQL connection string',
    example: 'postgresql://localhost:5432/mydb',
  }),
  API_KEY: str({
    desc: 'External API authentication key',
  }),
};

// This stays separate — envalidator skips this
export const env = cleanEnv(process.env, envSpec);
```

### 2. Create a config file

```ts
// envalidator.config.ts
import { defineConfig } from 'envalidator/config';

export default defineConfig({
  // Paths to modules exporting envalid specs
  sources: ['./src/env.ts'],

  // Glob patterns are supported for monorepos
  // sources: ['./packages/*/src/env.ts'],
  // sources: ['./src/env-*.ts', './packages/**/env.ts'],

  // Package specifiers work too (for shared env packages)
  // sources: ['@acme/core/env', './src/local-env.ts'],

  // Optional: override secret detection or descriptions
  overrides: {
    API_KEY: { secret: true },
    DATABASE_URL: { secret: true },
  },

  // Optional: custom output paths
  output: {
    markdown: './ENVIRONMENT.md',
    envExample: './.env.example',
  },
});
```

Config file is auto-discovered as `envalidator.config.ts`, `envalidator.config.js`, or `envalidator.config.mjs`.

## Usage

### Generate documentation

```bash
npx envalidator gen
```

This creates/updates `ENVIRONMENT.md` and `.env.example` based on your envalid specs.

### Check for drift

```bash
npx envalidator check
```

Compares your `.env` against your specs. Reports:

| Issue | Severity |
|---|---|
| Required var missing from `.env` | Error |
| Type mismatch (e.g. `PORT=abc`) | Error |
| Optional var missing from `.env` | Warning |
| Extra var in `.env` not in spec | Warning |
| Secret value found in `.env` | Warning |

### Generate and check in one step

```bash
npx envalidator gen --check
```

### CLI flags

| Flag | Description |
|---|---|
| `--config <path>` | Path to config file (default: auto-discover) |
| `--cwd <path>` | Working directory |
| `--env-file <path>` | Override `.env` file path for drift detection |
| `--check` | Run drift detection after generation |

### CI integration

```yaml
# GitHub Actions
- name: Generate env docs
  run: npx envalidator gen

- name: Check env drift
  run: npx envalidator check
```

## Output

### ENVIRONMENT.md

```markdown
# Environment Variables

| Name | Description | Type | Secret | Optional | Default | Choices |
|------|-------------|------|--------|----------|---------|---------|
| API_KEY | External API authentication key | str | YES | No | | |
| DATABASE_URL | PostgreSQL connection string (example: postgresql://localhost:5432/mydb) | str | YES | No | | |
| NODE_ENV | Application environment | str | | Yes | development | development, test, production |
| PORT | Server port | port | | Yes | 3000 | |

## Sources

- `./src/env.ts`
```

### .env.example

```bash
# External API authentication key
API_KEY=YOUR_API_KEY_HERE

# PostgreSQL connection string (example: postgresql://localhost:5432/mydb)
DATABASE_URL=postgresql://localhost:5432/mydb

# Application environment
# Choices: development, test, production
# NODE_ENV=development

# Server port
# PORT=3000
```

## Config Reference

```ts
interface EnvalidatorConfig {
  /** Import paths to modules exporting envalid specs. Supports glob patterns. */
  sources: string[];
  // Examples:
  //   ['./src/env.ts']
  //   ['./packages/*/src/env.ts']
  //   ['@acme/core/env', './src/local-env.ts']

  /** Output file paths */
  output?: {
    markdown?: string;   // Default: './ENVIRONMENT.md'
    envExample?: string; // Default: './.env.example'
    title?: string;       // Default: 'Environment Variables'
  };

  /** Patterns for automatic secret detection (case-insensitive substring match) */
  secretPatterns?: string[];
  // Default: ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PASSWD', 'CREDENTIAL', 'AUTH', 'PRIVATE']

  /** Explicit overrides for specific variables */
  overrides?: Record<string, {
    secret?: boolean;
    description?: string;
    example?: string;
  }>;

  /** Path to .env file for drift detection */
  envFilePath?: string; // Default: '.env'
}
```

## How It Works

1. **Resolves** each source path (relative file or package specifier)
2. **Imports** the module using dynamic `import()`
3. **Finds** the spec export (`envSpec`, `envConfig`, `env`, or default export)
4. **Extracts** metadata from each envalid validator: type, description, default, choices, example
5. **Detects secrets** using pattern matching + explicit overrides
6. **Generates** markdown table and `.env.example`
7. **Checks drift** by parsing `.env` and comparing against specs

## License

MIT
