#!/usr/bin/env node
import { Command } from 'commander';
import { buildCommand } from './commands/build';
import { themeCommand } from './commands/theme';
import { configCommand } from './commands/config';
import { initConfig } from './core/config';

const program = new Command();

program
  .name('storyboards')
  .description('Markdown から HTML プレゼンテーションを生成する CLI')
  .version('0.1.0');

program.addCommand(buildCommand());
program.addCommand(themeCommand());
program.addCommand(configCommand());

async function main() {
  try {
    await initConfig();
    await program.parseAsync(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
