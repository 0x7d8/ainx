import chalk from "chalk"
import fs from "fs"
import path from "path"
import { filesystem } from "@rjweb/utils"

export type Args = {}

export default async function info(args: Args) {
	const files = await fs.promises.readdir('.blueprint/extensions').catch(() => []),
		addons = await Promise.all(files.map(async(file) => {
			const ainxFile = await fs.promises.readFile(path.join('.blueprint/extensions', file, `${file}.ainx`)).catch(() => null)

			return ainxFile
		})).then((addons) => addons.filter(Boolean))

	const env = await filesystem.env('.env').catch(() => null)

	const seperator = '       '

	if (env?.APP_URL) console.log(seperator, chalk.gray('URL:        '), chalk.cyan(env.APP_URL))
	if (env?.APP_TIMEZONE) console.log(seperator, chalk.gray('Timezone:   '), chalk.cyan(env.APP_TIMEZONE))
	if (env?.PTERODACTYL_TELEMETRY_ENABLED) console.log(seperator, chalk.gray('Telemetry:  '), chalk.cyan(env.PTERODACTYL_TELEMETRY_ENABLED))
	if (env?.APP_LOCALE) console.log(seperator, chalk.gray('Locale:     '), chalk.cyan(env.APP_LOCALE))
	if (addons.length) console.log(seperator, chalk.gray('Addons:     '), chalk.cyan(addons.length))
}