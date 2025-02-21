import yargs from "yargs/yargs"
import { hideBin } from "yargs/helpers"
import { version as pckgVersion } from "../package.json"
import chalk from "chalk"
import * as pterodactyl from "src/globals/pterodactyl"
import { system } from "@rjweb/utils"
import semver from "semver"

import install from "src/commands/install"
import remove from "src/commands/remove"
import upgrade from "src/commands/upgrade"
import bundle from "src/commands/bundle"
import rebuild from "src/commands/rebuild"
import inspect from "src/commands/inspect"
import genpatch from "src/commands/genpatch"
import backupCreate from "src/commands/backup/create"
import backupRestore from "src/commands/backup/restore"
import logs from "src/commands/logs"
import list from "src/commands/list"
import info from "src/commands/info"

const pteroVersion = pterodactyl.version()

if (pteroVersion && pteroVersion.match(/v\d+\.\d+\.\d+/) && semver.lt(pteroVersion, '1.11.0')) {
  console.log()
  console.log(chalk.red('Pterodactyl version is not supported, please update to'), chalk.cyan('1.11.0'), chalk.red('or higher.'))

  process.exit(1)
}

let yarnVersion: string
try {
  yarnVersion = system.execute('yarn --version').trim()
} catch {
  yarnVersion = 'not installed'
}

const logo = Object.freeze([
  chalk.yellow('██  ██ '),
  chalk.yellow('  ██   '),
  chalk.yellow('██     ')
])

console.log()

console.log(logo[0], chalk.gray('Version:    '), chalk.cyan(`ainx@${pckgVersion}`.concat(pteroVersion ? ` (pterodactyl@${pteroVersion})` : '')))
console.log(logo[1], chalk.gray('Node:       '), chalk.cyan(process.version.slice(1)))
console.log(logo[2], chalk.gray('Yarn:       '), chalk.cyan(yarnVersion))

console.log()

function handleExit(code: number) {
  console.log()

  process.exit(code)
}

yargs(hideBin(process.argv))
  .version(pckgVersion)
  .command('install [files..]', 'install an addon', (yargs) => yargs
    .positional('files', {
      demandOption: true,
      type: 'string',
      description: 'the file(s) to install',
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
    })
    .option('excludeFlags', {
      alias: 'eF',
      type: 'string',
      description: 'exclude flags from the internal blueprint config',
      default: [],
      array: true
    }),
  (rg) => install(rg).then(handleExit))
  .command('remove [addons..]', 'remove an addon', (yargs) => yargs
    .positional('addons', {
      demandOption: true,
      type: 'string',
      description: 'the addon(s) to remove',
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
    })
    .option('excludeFlags', {
      alias: 'eF',
      type: 'string',
      description: 'exclude flags from the internal blueprint config',
      default: [],
      array: true
    }),
  (rg) => remove(rg).then(handleExit))
  .command('upgrade [files..]', 'upgrade an addon', (yargs) => yargs
    .positional('files', {
      demandOption: true,
      type: 'string',
      description: 'the file(s) to use for upgrading',
      array: true
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      description: 'force upgrade / skip confirmation',
      default: false
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
    })
    .option('excludeFlags', {
      alias: 'eF',
      type: 'string',
      description: 'exclude flags from the internal blueprint config',
      default: [],
      array: true
    }),
  (rg) => upgrade(rg).then(handleExit))
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
  (rg) => bundle(rg).then(handleExit))
  .command('rebuild', 'rebuild the panel frontend', (yargs) => yargs
    .option('disableSmoothMode', {
      alias: 'dSM',
      type: 'boolean',
      description: 'disable smooth build mode, try this if you have issues with rebuilding',
      default: false
    }),
  (rg) => rebuild(rg).then(handleExit))
  .command('inspect <file>', 'inspect an addon', (yargs) => yargs
    .positional('file', {
      demandOption: true,
      type: 'string',
      description: 'the file to inspect'
    }),
  (rg) => inspect(rg).then(handleExit))
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
    })
    .option('excludeFlags', {
      alias: 'eF',
      type: 'string',
      description: 'exclude flags from the internal blueprint config',
      default: [],
      array: true
    }),
  (rg) => genpatch(rg).then(handleExit))
  .command('backup', 'backup commands', (yargs) => yargs
    .command('create', 'create a panel backup', (yargs) => yargs,
    (rg) => backupCreate(rg).then(handleExit))
    .command('restore', 'restore a panel backup', (yargs) => yargs,
    (rg) => backupRestore(rg).then(handleExit))
    .strictCommands()
    .demandCommand(1)
  )
  .command('list', 'list installed addons', (yargs) => yargs,
  (rg) => list(rg).then(handleExit))
  .command('info', 'show general information', (yargs) => yargs
    .option('modules', {
      alias: 'm',
      type: 'boolean',
      description: 'show loaded php modules',
      default: false
    }),
  (rg) => info(rg).then(handleExit))
  .command('logs', 'upload a panel log', (yargs) => yargs,
  (rg) => logs(rg).then(handleExit))
  .strictCommands()
  .demandCommand(1)
  .parse()