import chalk from "chalk"
import fs from "fs"
import path from "path"
import { filesystem, number, size, system } from "@rjweb/utils"
import os from "os"

export type Args = {
	modules: boolean
}

export default async function info(args: Args): Promise<number> {
	const files = await fs.promises.readdir('.blueprint/extensions').catch(() => []),
		addons = await Promise.all(files.map(async(file) => {
			const ainxFile = await fs.promises.readFile(path.join('.blueprint/extensions', file, `${file}.ainx`)).catch(() => null)

			return ainxFile
		})).then((addons) => addons.filter(Boolean))

	const env = await filesystem.env('.env').catch(() => null),
		seperator = '       '

	let php: string | null = null
	try {
		php = system.execute('php -v').split('\n')[0].split(' ')[1]
	} catch { }

	const modules: string[] = []
	if (php) {
		try {
			const output = system.execute('php -r "print_r(json_encode(get_loaded_extensions()));"')

			if (output) {
				const loaded = JSON.parse(output)

				for (const module of loaded) {
					modules.push(module)
				}
			}
		} catch { }
	}

	console.log(seperator, chalk.gray('PHP:        '), chalk[!php || parseInt(php.split('.')[0]) < 8 ? 'red' : 'cyan'](php ? `${php} (${args.modules ? modules.join(', ') : `${modules.length} modules`})` : 'Not installed'))
	console.log(seperator, chalk.gray('CPU Threads:'), chalk.cyan(os.cpus().length))
	console.log(seperator, chalk.gray('Memory:     '), chalk[os.totalmem() < size(4).gb() ? 'red' : 'cyan'](`${number.round(os.totalmem() / 1024 / 1024 / 1024, 2)}GB (4GB recommended)`))
	console.log(seperator, chalk.gray('Platform:   '), chalk.cyan(`${os.platform()} (${os.arch()}), ${os.release()}`))

	if (env || addons.length) console.log()

	if (env?.APP_URL) console.log(seperator, chalk.gray('URL:        '), chalk.cyan(env.APP_URL))
	if (env?.APP_TIMEZONE) console.log(seperator, chalk.gray('Timezone:   '), chalk.cyan(env.APP_TIMEZONE))
	if (env?.PTERODACTYL_TELEMETRY_ENABLED) console.log(seperator, chalk.gray('Telemetry:  '), chalk.cyan(env.PTERODACTYL_TELEMETRY_ENABLED))
	if (env?.APP_LOCALE) console.log(seperator, chalk.gray('Locale:     '), chalk.cyan(env.APP_LOCALE))
	if (addons.length) console.log(seperator, chalk.gray('Addons:     '), chalk.cyan(addons.length))

	return 0
}