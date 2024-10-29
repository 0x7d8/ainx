import chalk from "chalk"
import fs from "fs"
import path from "path"
import * as ainx from "src/globals/ainx"

export type Args = {}

export default async function list(args: Args): Promise<number> {
	if (!fs.existsSync('.blueprint/extensions')) {
		console.error(chalk.red('No addons installed'))
		return 1
	}

	const files = await fs.promises.readdir('.blueprint/extensions'),
		addons = await Promise.all(files.map(async(file) => {
			const ainxFile = await fs.promises.readFile(path.join('.blueprint/extensions', file, `${file}.ainx`)).catch(() => null)

			return ainxFile ? ainx.parse(ainxFile) : null!
		})).then((addons) => addons.filter(Boolean))

	if (!addons.length) {
		console.error(chalk.red('No addons installed'))
		return 1
	}

	for (const [ data, conf ] of addons.sort((a, b) => a[1].info.name.localeCompare(b[1].info.name))) {
		console.log(chalk.bold(conf.info.name))
		console.log(' ', chalk.gray('Identifier:'), chalk.cyan(conf.info.identifier))
		console.log(' ', chalk.gray('Version:   '), chalk.cyan(conf.info.version))
		console.log(' ', chalk.gray('Author:    '), chalk.cyan(conf.info.author))
		if (conf.info.website) console.log(' ', chalk.gray('Website:   '), chalk.cyan(conf.info.website))

		const ainxFileStat = await fs.promises.stat(`.blueprint/extensions/${data.id}/${data.id}.ainx`)

		console.log(' ', chalk.gray('Installed: '), chalk.cyan(ainxFileStat.mtime.toLocaleString()))
		console.log(' ', chalk.gray('Size:      '), chalk.cyan(`${(ainxFileStat.size / 1024).toFixed(2)} KB`))
		console.log()
	}

	return 0
}