#!/usr/bin/env node

// CLI entry point - will be implemented in task 14
import { program } from 'commander';

program
  .name('depguardian')
  .description('A CLI tool that scans JavaScript/TypeScript projects for dependency issues and fixes them')
  .version('1.0.11');

// Commands will be added in task 14
program.parse();