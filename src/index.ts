#!/usr/bin/env node

import yargs from "yargs/yargs"
import { hideBin } from "yargs/helpers"
import { version as pckgVersion } from "../package.json"

import install from "src/commands/install"
import remove from "src/commands/remove"
import upgrade from "src/commands/upgrade"
import bundle from "src/commands/bundle"
import rebuild from "src/commands/rebuild"
import installed from "src/commands/installed"

yargs(hideBin(process.argv))
  .version(pckgVersion)
  .command('install <file>', 'install an addon', (yargs) => yargs
    .positional('file', {
      demandOption: true,
      type: 'string',
      description: 'the file to install'
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      description: 'force install',
      default: false
    }),
  (rg) => install(rg))
  .command('remove <addon>', 'remove an addon', (yargs) => yargs
    .positional('addon', {
      demandOption: true,
      type: 'string',
      description: 'the addon to remove'
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      description: 'force remove',
      default: false
    })
    .option('rebuild', {
      alias: 'r',
      type: 'boolean',
      description: 'rebuild panel ui after removal',
      default: true
    })
    .option('migrate', {
      alias: 'm',
      type: 'boolean',
      description: 'migrate data after removal (removes addon data from database)',
      default: false
    }),
  (rg) => remove(rg))
  .command('upgrade <file>', 'upgrade an addon', (yargs) => yargs
    .positional('file', {
      demandOption: true,
      type: 'string',
      description: 'the file to use to upgrade'
    }),
  (rg) => upgrade(rg))
  .command('bundle', 'bundle an addon', (yargs) => yargs,
  (rg) => bundle(rg))
  .command('rebuild', 'rebuild panel ui', (yargs) => yargs,
  (rg) => rebuild(rg))
  .command('installed', 'list installed addons', (yargs) => yargs,
  (rg) => installed(rg))
  .strictCommands()
  .demandCommand(1)
  .parse()