import yargs from "yargs/yargs"
import { hideBin } from "yargs/helpers"
import { version as pckgVersion } from "../package.json"
import chalk from "chalk"

import install from "src/commands/install"
import remove from "src/commands/remove"
import upgrade from "src/commands/upgrade"
import bundle from "src/commands/bundle"
import rebuild from "src/commands/rebuild"
import installed from "src/commands/installed"

console.log(chalk.bold.red('IF THERE ARE ANY ISSUES WITH THIS CLI, PLEASE REPORT THEM WITH'))
console.log(chalk.bold.red('YOUR ADDON AUTHOR OR ON GITHUB (https://github.com/0x7d8/ainx)'))

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
  .command('bundle', 'bundle an addon', (yargs) => yargs
    .option('ainx', {
      alias: 'a',
      type: 'boolean',
      description: 'only create an ainx file',
      default: false
    }),
  (rg) => bundle(rg))
  .command('rebuild', 'rebuild panel ui', (yargs) => yargs,
  (rg) => rebuild(rg))
  .command('installed', 'list installed addons', (yargs) => yargs,
  (rg) => installed(rg))
  .strictCommands()
  .demandCommand(1)
  .parse()