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
- **Resilient extraction** — continues extracting from other sources if one fails
- **Ignore patterns** — exclude specific vars from drift checks
- **Machine-readable output** — `--format json` for CI pipelines
- **Configurable fail level** — control whether warnings fail CI

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
```

### 2. Create a config file

```ts
// envalidator.config.ts
import { defineConfig } from 'envalidator';

export default defineConfig({
  // Paths to your envalid spec files
  sources: ['./src/env.ts', './src/local-env.ts'],

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

- **Error**: Required var missing from `.env`
- **Error**: Type mismatch (e.g. `PORT=abc`)
- **Warning**: Optional var missing from `.env`
- **Warning**: Extra var in `.env` not in spec
- **Warning**: Secret value found in `.env`

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
| `--format <human\|json>` | Output format (default: human) |
| `--fail-level <error\|warning\|off>` | Minimum severity to exit with code 1 (default: error) |
| `--ignore <pattern>` | Exclude vars matching pattern from drift checks (repeatable) |
| `--check` | Run drift detection after generation |

### CI integration

```yaml
# GitHub Actions
- name: Generate env docs
  run: npx envalidator gen

- name: Check env drift
  run: npx envalidator check --format json --fail-level warning

- name: Check env drift (ignoring local-only vars)
  run: npx envalidator check --ignore EDITOR --ignore PAGER
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
- `./src/local-env.ts`
```

### .env.example

```bash
# PostgreSQL connection string
# Docs: https://example.com/docs/db
DATABASE_URL=postgresql://localhost:5432/mydb

# External API authentication key
API_KEY=YOUR_API_KEY_HERE

# Application environment
# Choices: development, test, production
# NODE_ENV=development

# Server port
# PORT=3000
```

## Programmatic API

```ts
import { run, extractFromSource, detectDrift, loadConfig } from 'envalidator';

// Full pipeline: extract, generate, drift check
const { specs, drift, warnings } = await run();

// Or just extract specs from a single source
const specs = await extractFromSource('./src/env.ts');

// Or load config and check drift yourself
const config = await loadConfig('./my-project');
```

### Config type

```ts
import type { defineConfig } from 'envalidator';

export default defineConfig({
  /** Import paths to envalid spec files */
  sources: string[];

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
});
```

## How It Works

1. **Resolves** each source path (relative file or package specifier)
2. **Imports** the module using jiti (handles TS and extensionless imports)
3. **Finds** the spec export (`envSpec`, `envConfig`, `env`, or default export)
4. **Extracts** metadata from each envalid validator: type, description, default, choices, example
5. **Detects secrets** using pattern matching + explicit overrides
6. **Generates** markdown table and `.env.example`
7. **Checks drift** by parsing `.env` and comparing against specs

## License

MIT
