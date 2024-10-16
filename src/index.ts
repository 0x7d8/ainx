import yargs from "yargs/yargs"
import { hideBin } from "yargs/helpers"
import { version as pckgVersion } from "../package.json"
import chalk from "chalk"
import cp from "child_process"

import install from "src/commands/install"
import remove from "src/commands/remove"
import upgrade from "src/commands/upgrade"
import bundle from "src/commands/bundle"
import rebuild from "src/commands/rebuild"
import inspect from "src/commands/inspect"
import list from "src/commands/list"
import info from "src/commands/info"

console.log(chalk.bold.red('IF THERE ARE ANY ISSUES WITH THIS CLI, PLEASE REPORT THEM WITH'))
console.log(chalk.bold.red('YOUR ADDON AUTHOR OR ON GITHUB (https://github.com/0x7d8/ainx)'))

const yarnVersion = cp.execSync('yarn --version').toString().trim()

const logo = Object.freeze([
  chalk.yellow('██  ██ '),
  chalk.yellow('  ██   '),
  chalk.yellow('██     ')
])

console.log()

console.log(logo[0], chalk.gray('Version:    '), chalk.cyan(`ainx@${pckgVersion}`))
console.log(logo[1], chalk.gray('Node:       '), chalk.cyan(process.version.slice(1)))
console.log(logo[2], chalk.gray('Yarn:       '), chalk.cyan(yarnVersion))

console.log()

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
    })
    .option('rebuild', {
      alias: 'r',
      type: 'boolean',
      description: 'rebuild panel ui after installation',
      default: true
    })
    .option('skipSteps', {
      alias: 's',
      type: 'boolean',
      description: 'skip ainx metadata installation steps',
      default: false
    })
    .option('generateFromBlueprint', {
      alias: ['gFB', 'sendHelpIAmMentallyUnstableAndTryingToUseThis'],
      type: 'boolean',
      description: 'generate an ainx file for any blueprint addon, HIGHLY experimental, NOT recommended.',
      default: false,
      hidden: true
    })
    .option('disableSmoothMode', {
      alias: 'dSM',
      type: 'boolean',
      description: 'disable smooth build mode, try this if you have issues with rebuilding',
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
    })
    .option('skipSteps', {
      alias: 's',
      type: 'boolean',
      description: 'skip ainx metadata removal steps',
      default: false
    })
    .option('disableSmoothMode', {
      alias: 'dSM',
      type: 'boolean',
      description: 'disable smooth build mode, try this if you have issues with rebuilding',
      default: false
    }),
  (rg) => remove(rg))
  .command('upgrade <file>', 'upgrade an addon', (yargs) => yargs
    .positional('file', {
      demandOption: true,
      type: 'string',
      description: 'the file to use to upgrade'
    })
    .option('skipSteps', {
      alias: 's',
      type: 'boolean',
      description: 'skip ainx metadata upgrade steps',
      default: false
    })
    .option('rebuild', {
      alias: 'r',
      type: 'boolean',
      description: 'rebuild panel ui after upgrade',
      default: true
    })
    .option('disableSmoothMode', {
      alias: 'dSM',
      type: 'boolean',
      description: 'disable smooth build mode, try this if you have issues with rebuilding',
      default: false
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
  .command('rebuild', 'rebuild panel ui', (yargs) => yargs
    .option('disableSmoothMode', {
      alias: 'dSM',
      type: 'boolean',
      description: 'disable smooth build mode, try this if you have issues with rebuilding',
      default: false
    }),
  (rg) => rebuild(rg))
  .command('inspect <file>', 'inspect an addon', (yargs) => yargs
    .positional('file', {
      demandOption: true,
      type: 'string',
      description: 'the file to inspect'
    }),
  (rg) => inspect(rg))
  .command('list', 'list installed addons', (yargs) => yargs,
  (rg) => list(rg))
  .command('info', 'show panel information', (yargs) => yargs,
  (rg) => info(rg))
  .strictCommands()
  .demandCommand(1)
  .parse()