import chalk from "chalk"
import fs from "fs"
import AdmZip from "adm-zip"
import { manifest } from "src/types/manifest"
import path from "path"
import * as blueprint from "src/globals/blueprint"

export type Args = {}

export default async function list(args: Args) {
	if (!fs.existsSync('.blueprint/extensions')) {
		console.error(chalk.red('No addons installed'))
		process.exit(1)
	}

	const files = await fs.promises.readdir('.blueprint/extensions'),
		addons = await Promise.all(files.map(async(file) => {
			const ainxFile = await fs.promises.readFile(path.join('.blueprint/extensions', file, `${file}.ainx`)).catch(() => null)

			return ainxFile
		})).then((addons) => addons.filter(Boolean))

	if (!addons.length) {
		console.error(chalk.red('No addons installed'))
		process.exit(1)
	}

	console.log(chalk.green('Installed addons:'))

	for (const addon of addons) {
		const zip = new AdmZip(addon!),
			data = manifest.safeParse(JSON.parse(zip.readAsText('manifest.json')))

		if (!data.success) continue

		const bpZip = new AdmZip(zip.readFile('addon.blueprint') ?? undefined),
			conf = blueprint.config(bpZip.readAsText('conf.yml'))

		console.log(' ', chalk.bold(conf.info.name))
		console.log('  ', chalk.gray('Identifier:'), chalk.cyan(conf.info.identifier))
		console.log('  ', chalk.gray('Version:   '), chalk.cyan(conf.info.version))
		console.log('  ', chalk.gray('Author:    '), chalk.cyan(conf.info.author))
		if (conf.info.website) console.log('  ', chalk.gray('Website:   '), chalk.cyan(conf.info.website))

		const ainxFileStat = await fs.promises.stat(`.blueprint/extensions/${data.data.id}/${data.data.id}.ainx`)

		console.log('  ', chalk.gray('Installed: '), chalk.cyan(ainxFileStat.mtime.toLocaleString()))
		console.log('  ', chalk.gray('Size:      '), chalk.cyan(`${(ainxFileStat.size / 1024).toFixed(2)} KB`))
		console.log()
	}
}