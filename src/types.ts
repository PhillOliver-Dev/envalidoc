/**
 * Core types for envalidoc.
 *
 * These types represent the extracted information from envalid specs
 * and the configuration for the tool itself.
 */

// --- Extracted env var metadata ---

/** Known envalid validator types */
export type EnvVarType =
  | 'str'
  | 'num'
  | 'bool'
  | 'port'
  | 'url'
  | 'email'
  | 'host'
  | 'json'
  | 'jsonObj'
  | 'custom';

/** A single environment variable extracted from an envalid spec */
export interface EnvVarSpec {
  /** The environment variable name, e.g. DATABASE_URL */
  name: string;

  /** The envalid validator type used */
  type: EnvVarType;

  /** Human-readable description from the `desc` spec option */
  description: string;

  /** Whether the variable is optional (has a default or devDefault) */
  optional: boolean;

  /** Whether the variable is a secret (token, key, password, etc.) */
  secret: boolean;

  /** Default value, if defined in the spec */
  defaultValue?: string;

  /** Development default value, if defined in the spec */
  devDefaultValue?: string;

  /** Valid choices, if restricted by the `choices` spec option */
  choices?: readonly string[];

  /** Example value from the `example` spec option */
  example?: string;

  /** Link to additional docs from the `docs` spec option */
  docs?: string;

  /** Source file where this spec was defined */
  source: string;
}

/** All extracted env vars across all configured sources */
export interface ExtractedSpecs {
  /** Map of env var name to its full spec */
  vars: Map<string, EnvVarSpec>;

  /** Source files that were processed */
  sources: string[];
}

// --- Drift detection ---

export type DriftSeverity = 'error' | 'warning' | 'info';

export interface DriftIssue {
  severity: DriftSeverity;
  type: DriftType;
  message: string;
  varName?: string;
}

export type DriftType =
  | 'missing-required'
  | 'missing-optional'
  | 'extra-var'
  | 'type-mismatch'
  | 'secret-in-dotenv';

export interface DriftResult {
  issues: DriftIssue[];
  hasErrors: boolean;
}

// --- Configuration ---

export interface EnvalidocConfig {
  /**
   * Import paths to envalid spec definitions.
   * Each path should resolve to a module exporting an envalid spec object.
   *
   * Supported formats:
   * - Relative file paths: './src/env.ts', './packages/core/env.js'
   * - Package specifiers: '@myorg/core/env'
   *
   * The module must export a named `envSpec` or `envConfig` object,
   * or a default export that is the spec object itself.
   */
  sources: string[];

  /** Output configuration */
  output: OutputConfig;

  /**
   * Patterns for secret detection.
   * If a variable name contains any of these strings (case-insensitive),
   * it will be marked as a secret.
   */
  secretPatterns?: string[];

  /**
   * Explicit overrides for individual variables.
   * Use this to force-mark a variable as secret (or not),
   * override descriptions, or add metadata.
   */
  overrides?: Record<string, Partial<Pick<EnvVarSpec, 'secret' | 'description' | 'example'>>>;

  /**
   * Path to the .env file to check for drift.
   * Defaults to '.env' in the current working directory.
   */
  envFilePath?: string;
}

export interface OutputConfig {
  /** Path for the generated ENVIRONMENT.md file. Default: './ENVIRONMENT.md' */
  markdown?: string;

  /** Path for the generated .env.example file. Default: './.env.example' */
  envExample?: string;

  /** Title for the ENVIRONMENT.md document. Default: 'Environment Variables' */
  title?: string;
}

/** Shape of the user's config file (mirrors EnvalidocConfig but with looser types) */
export interface UserConfigFile {
  sources?: string[];
  output?: Partial<OutputConfig>;
  secretPatterns?: string[];
  overrides?: Record<string, Partial<Pick<EnvVarSpec, 'secret' | 'description' | 'example'>>>;
  envFilePath?: string;
}

/** Resolved config with all defaults applied */
export interface ResolvedConfig extends Readonly<EnvalidocConfig> {
  output: Required<OutputConfig>;
  secretPatterns: string[];
  overrides: Record<string, Partial<Pick<EnvVarSpec, 'secret' | 'description' | 'example'>>>;
  envFilePath: string;
}

export const DEFAULT_SECRET_PATTERNS = [
  'KEY',
  'SECRET',
  'TOKEN',
  'PASSWORD',
  'PASSWD',
  'CREDENTIAL',
  'AUTH',
  'PRIVATE',
] as const;

export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'sources'> = {
  output: {
    markdown: './ENVIRONMENT.md',
    envExample: './.env.example',
    title: 'Environment Variables',
  },
  secretPatterns: [...DEFAULT_SECRET_PATTERNS],
  overrides: {},
  envFilePath: '.env',
};

// --- Spec export names to look for ---

export const SPEC_EXPORT_NAMES = ['envSpec', 'envConfig', 'env'] as const;
export type SpecExportName = (typeof SPEC_EXPORT_NAMES)[number];
