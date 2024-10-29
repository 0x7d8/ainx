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
import genpatch from "src/commands/genpatch"
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
  .command('install [files..]', 'install an addon', (yargs) => yargs
    .positional('files', {
      demandOption: true,
      type: 'string',
      description: 'the file to install',
      array: true
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
    })
    .option('applyPermissions', {
      alias: 'aP',
      type: 'boolean',
      description: 'apply permissions to files for the pterodactyl webserver',
      default: true
    }),
  (rg) => install(rg))
  .command('remove [addons..]', 'remove an addon', (yargs) => yargs
    .positional('addons', {
      demandOption: true,
      type: 'string',
      description: 'the addon to remove',
      array: true
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
  .command('upgrade [files..]', 'upgrade an addon', (yargs) => yargs
    .positional('files', {
      demandOption: true,
      type: 'string',
      description: 'the file to use to upgrade',
      array: true
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
    })
    .option('patches', {
      alias: 'p',
      type: 'boolean',
      description: 'create patches for the addon',
      default: false
    })
    .option('remote', {
      alias: 'r',
      type: 'string',
      description: 'remote url or local path to compare against for patches',
      default: 'https://github.com/pterodactyl/panel/releases/latest/download/panel.tar.gz'
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
  .command('genpatch <file>', 'generate a patch', (yargs) => yargs
    .positional('file', {
      demandOption: true,
      type: 'string',
      description: 'the file to generate a patch for'
    })
    .option('outfile', {
      alias: 'o',
      type: 'string',
      description: 'output file for the patch'
    })
    .option('old', {
      type: 'string',
      description: 'old file to compare against, useful for upgrades'
    })
    .option('skipSteps', {
      alias: 's',
      type: 'boolean',
      description: 'skip ainx metadata installation steps',
      default: false
    })
    .option('remote', {
      alias: 'r',
      type: 'string',
      description: 'remote url or local path to compare against',
      default: 'https://github.com/pterodactyl/panel/releases/latest/download/panel.tar.gz'
    })
    .option('includeCompat', {
      alias: 'iC',
      type: 'boolean',
      description: 'include compatibility files for blueprint, you will need to do this at least once, HIGHLY IMPORTANT',
      default: false
    })
    .option('skipRoutes', {
      alias: 'sR',
      type: 'boolean',
      description: 'skip manual frontend route insertion, generally recommended for more compatible patches',
      default: false
    }),
  (rg) => genpatch(rg))
  .command('list', 'list installed addons', (yargs) => yargs,
  (rg) => list(rg))
  .command('info', 'show general information', (yargs) => yargs,
  (rg) => info(rg))
  .strictCommands()
  .demandCommand(1)
  .parse()