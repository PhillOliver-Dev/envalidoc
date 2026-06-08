#!/usr/bin/env node

import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { extractAllSpecs, run } from './index.js';
import { detectDrift } from './utils/drift.js';
import type { DriftResult } from './types.js';

// ANSI color helpers
const reset = '\x1b[0m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const green = '\x1b[32m';
const dim = '\x1b[2m';
const bold = '\x1b[1m';

function error(msg: string): void {
  process.stderr.write(`${red}\u2716 ${msg}${reset}\n`);
}

function warn(msg: string): void {
  process.stderr.write(`${yellow}\u26a0 ${msg}${reset}\n`);
}

function info(msg: string): void {
  process.stdout.write(`${dim}${msg}${reset}\n`);
}

function success(msg: string): void {
  process.stdout.write(`${green}\u2714 ${msg}${reset}\n`);
}

// Minimal CLI argument parser
export interface CliArgs {
  command: string | null;
  config: string | null;
  cwd: string | null;
  envFile: string | null;
  format: string | null;
  failLevel: string | null;
  ignore: string[];
  check: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: null,
    config: null,
    cwd: null,
    envFile: null,
    format: null,
    failLevel: null,
    ignore: [],
    check: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--config') {
      args.config = argv[++i] as string;
    } else if (arg === '--cwd') {
      args.cwd = argv[++i] as string;
    } else if (arg === '--env-file') {
      args.envFile = argv[++i] as string;
    } else if (arg === '--format') {
      args.format = argv[++i] as string;
    } else if (arg === '--fail-level') {
      args.failLevel = argv[++i] as string;
    } else if (arg === '--ignore') {
      args.ignore.push(argv[++i] as string);
    } else if (arg === '--check') {
      args.check = true;
    } else if (arg === '--version' || arg === '-v') {
      args.command = 'version';
    } else if (!arg.startsWith('-')) {
      args.command = arg;
    }
  }

  return args;
}

export function shouldFail(drift: DriftResult, failLevel: string): boolean {
  if (failLevel === 'off') return false;
  if (failLevel === 'warning') return drift.issues.some(
    (i) => i.severity === 'error' || i.severity === 'warning',
  );
  // default: 'error'
  return drift.hasErrors;
}

function printDrift(drift: DriftResult): void {
  if (drift.issues.length === 0) {
    success('No drift detected.');
    return;
  }

  for (const issue of drift.issues) {
    if (issue.severity === 'error') {
      error(issue.message);
    } else if (issue.severity === 'warning') {
      warn(issue.message);
    } else {
      info(`  \u2139 ${issue.message}`);
    }
  }
}

function printDriftJson(drift: DriftResult): void {
  process.stdout.write(JSON.stringify(drift, null, 2) + '\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (!args.command || args.command === 'help' || args.command === '--help' || args.command === '-h') {
    const usage = [
      '',
      `${bold}envalidoc${reset}`,
      '',
      'Commands:',
      '  gen       Generate ENVIRONMENT.md and .env.example',
      '  check     Detect drift between .env and envalid specs',
      '',
      'Flags:',
      '  --config <path>       Path to config file (default: auto-discover)',
      '  --cwd <path>          Working directory',
      '  --env-file <path>     Override .env file path for drift detection',
      '  --format <human|json> Output format (default: human)',
      '  --fail-level <error|warning|off>  Minimum severity to fail CI (default: error)',
      '  --ignore <pattern>    Ignore vars matching pattern in drift checks (repeatable)',
      '  --check               Run drift detection after generation (use with gen)',
      '  --version             Show version number',
      '',
    ].join('\n');
    process.stdout.write(usage);
    return;
  }

  if (args.command === 'version' || args.command === '--version' || args.command === '-v') {
    const packageJson = await import('../package.json', { with: { type: 'json' } });
    process.stdout.write(`v${packageJson.default.version}\n`);
    return;
  }

  const baseDir = args.cwd ?? process.cwd();
  const failLevel = args.failLevel ?? 'error';
  const outputFormat = args.format ?? 'human';

  try {
    if (args.command === 'gen') {
      process.stdout.write(`${bold}Generating env documentation${reset}\n`);

      const config = args.config 
        ? await loadConfig(baseDir, args.config)
        : await loadConfig(baseDir);
        
      const result = await run(config, baseDir);

      // Print source warnings
      for (const w of result.warnings) {
        warn(w);
      }

      if (args.check && result.drift) {
        process.stdout.write(`\n${bold}Checking drift${reset}\n`);
        if (outputFormat === 'json') {
          printDriftJson(result.drift);
        } else {
          printDrift(result.drift);
        }
        if (shouldFail(result.drift, failLevel)) {
          process.exit(1);
        }
      }

      success('Done.');
    } else if (args.command === 'check') {
      process.stdout.write(`${bold}Checking drift${reset}\n`);

      const config = args.config
        ? await loadConfig(baseDir, args.config)
        : await loadConfig(baseDir);
      const resolvedEnvFile = args.envFile ?? config.envFilePath;
      const envFilePath = resolve(baseDir, resolvedEnvFile);

      const { specs, warnings } = await extractAllSpecs(
        config.sources,
        config.secretPatterns,
        config.overrides,
        baseDir,
      );

      // Print source warnings
      for (const w of warnings) {
        warn(w);
      }

      const drift = await detectDrift(specs, envFilePath, { ignore: args.ignore });

      if (outputFormat === 'json') {
        printDriftJson(drift);
      } else {
        printDrift(drift);
      }

      if (shouldFail(drift, failLevel)) {
        process.exit(1);
      }
    } else {
      error(`Unknown command: ${args.command}`);
      process.exit(1);
    }
  } catch (err) {
    error((err as Error).message);
    process.exit(2);
  }
}

main();
