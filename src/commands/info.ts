import chalk from "chalk"
import fs from "fs"
import { version as pckgVersion } from "../../package.json"
import path from "path"
import { filesystem } from "@rjweb/utils"
import cp from "child_process"

export type Args = {}

export default async function info(args: Args) {
	if (!fs.existsSync('.env')) {
		console.error(chalk.red('No Pterodactyl Panel'), chalk.cyan('.env'), chalk.red('file found'))
		process.exit(1)
	}

	const files = await fs.promises.readdir('.blueprint/extensions').catch(() => []),
		addons = await Promise.all(files.map(async(file) => {
			const ainxFile = await fs.promises.readFile(path.join('.blueprint/extensions', file, `${file}.ainx`)).catch(() => null)

			return ainxFile
		})).then((addons) => addons.filter(Boolean))

	const env = await filesystem.env('.env')

	const yarnVersion = cp.execSync('yarn --version').toString().trim()

	console.log()
	console.log(chalk.gray('Version:'), chalk.cyan(pckgVersion))
	console.log(chalk.gray('Folder:'), chalk.cyan(process.cwd()))
	if (env.APP_URL) console.log(chalk.gray('URL:'), chalk.cyan(env.APP_URL))
	if (env.APP_LOCALE) console.log(chalk.gray('Locale:'), chalk.cyan(env.APP_LOCALE))
	if (env.APP_TIMEZONE) console.log(chalk.gray('Timezone:'), chalk.cyan(env.APP_TIMEZONE))
	console.log(chalk.gray('Addons:'), chalk.cyan(addons.length))
	if (env.PTERODACTYL_TELEMETRY_ENABLED) console.log(chalk.gray('Telemetry:'), chalk.cyan(env.PTERODACTYL_TELEMETRY_ENABLED))
	console.log(chalk.gray('Node:'), chalk.cyan(process.version))
	console.log(chalk.gray('Yarn:'), chalk.cyan(yarnVersion))
}