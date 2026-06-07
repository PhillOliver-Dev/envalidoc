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
interface CliArgs {
  command: string | null;
  config: string | null;
  cwd: string | null;
  envFile: string | null;
  check: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: null,
    config: null,
    cwd: null,
    envFile: null,
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
    } else if (arg === '--check') {
      args.check = true;
    } else if (!arg.startsWith('-')) {
      args.command = arg;
    }
  }

  return args;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (!args.command || args.command === 'help') {
    const usage = [
      '',
      `${bold}envalidator${reset}`,
      '',
      'Commands:',
      '  gen       Generate ENVIRONMENT.md and .env.example',
      '  check     Detect drift between .env and envalid specs',
      '',
      'Flags:',
      '  --config <path>     Path to config file (default: auto-discover)',
      '  --cwd <path>        Working directory',
      '  --env-file <path>   Override .env file path for drift detection',
      '  --check             Run drift detection after generation (use with gen)',
      '',
    ].join('\n');
    process.stdout.write(usage);
    process.exit(0);
  }

  try {
    if (args.command === 'gen') {
      process.stdout.write(`${bold}Generating env documentation${reset}\n`);

      // Use the shared run() from index.ts for the core logic.
      // run() always writes files and returns drift.
      const result = await run();

      if (args.check && result.drift) {
        process.stdout.write(
          `\n${bold}Checking drift${reset}\n`,
        );
        printDrift(result.drift);
        if (result.drift.hasErrors) {
          process.exit(1);
        }
      }
    } else if (args.command === 'check') {
      process.stdout.write(`${bold}Checking drift${reset}\n`);

      // Load config, extract specs via shared extractAllSpecs, then check drift
      const config = await loadConfig(args.cwd ?? undefined);
      const resolvedEnvFile = args.envFile ?? config.envFilePath;
      const envFilePath = resolve(
        args.cwd ?? process.cwd(),
        resolvedEnvFile,
      );

      const specs = await extractAllSpecs(
        config.sources,
        config.secretPatterns,
        config.overrides,
      );
      const drift = await detectDrift(specs, envFilePath);
      printDrift(drift);
      if (drift.hasErrors) {
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
