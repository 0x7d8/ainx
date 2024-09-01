import yaml from "js-yaml"
import { version as pckgVersion } from "../../package.json"
import { number } from "@rjweb/utils"
import * as fs from "fs"
import chalk from "chalk"

export type BlueprintConfig = {
	info: {
		identifier: string
		name: string
		version: string
		target: string
		flags?: string
		author?: string
		website?: string
	}

	requests?: {
		controllers?: string
		routers?: {
			client?: string
			application?: string
			web?: string
		}
	}

	data?: {
		public?: string
		directory?: string
	}

	database?: {
		migrations?: string
	}
}

export function config(raw: string) {
	const data = yaml.load(raw) as BlueprintConfig

	return data
}

export function environment(conf: BlueprintConfig) {
	return {
		BLUEPRINT_VERSION: `ainx@${pckgVersion}`,
		BLUEPRINT_DEVELOPER: 'false',
		EXTENSION_TARGET: conf.info.target,
		EXTENSION_IDENTIFIER: conf.info.identifier,
		EXTENSION_VERSION: conf.info.version,
		PTERODACTYL_DIRECTORY: process.cwd()
	}
}

export function placeholders(conf: BlueprintConfig, input: string): string {
	if (conf.info.flags?.includes('ignorePlaceholders')) return input

	const placeholders: Record<string, string> = {
		'{identifier}': conf.info.identifier,
		'{identifier^}': conf.info.identifier.slice(0, 1).toUpperCase().concat(conf.info.identifier.slice(1)),
		'{identifier!}': conf.info.identifier.toUpperCase(),
		'{name}': conf.info.name,
		'{name!}': conf.info.name.toUpperCase(),
		'{author}': conf.info.author ?? 'null',
		'{version}': conf.info.version,

		'{random}': number.generate(0, 99999).toString(),
		'{timestamp}': Math.floor(Date.now() / 1000).toString(),
		'{mode}': 'local',
		'{target}': `ainx@${pckgVersion}`,
		'{is_target}': 'false',

		'{root}': process.cwd(),
		'{root/public}': `${process.cwd()}/.blueprint/extensions/${conf.info.identifier}/public`,
		'{root/data}': `${process.cwd()}/.blueprint/extensions/${conf.info.identifier}/data`,

		'{webroot}': '/',
		'{webroot/public}': `/extensions/${conf.info.identifier}`,
		'{webroot/fs}': `/fs/extensions/${conf.info.identifier}`
	}

	return input.replace(/{[^}]+}/g, (match) => placeholders[match] ?? match)
}

export async function recursivePlaceholders(conf: BlueprintConfig, dir: string) {
	if (conf.info.flags?.includes('ignorePlaceholders')) return

	for await (const file of await fs.promises.opendir(dir)) {
		if (file.isDirectory()) continue

		const content = await fs.promises.readFile(`${dir}/${file.name}`)

		console.log(chalk.gray('Processing Placeholders on'), chalk.cyan(file.name), chalk.gray('...'))

		if (content.includes(Buffer.from([0]))) {
			console.error(chalk.gray('Processing Placeholders on'), chalk.cyan(file.name), chalk.gray('...'), chalk.bold.red('Binary'))
			continue
		}

		const string = content.toString(),
			text = placeholders(conf, string)

		if (text !== string) {
			await fs.promises.writeFile(`${dir}/${file.name}`, text)

			console.log(chalk.gray('Processing Placeholders on'), chalk.cyan(file.name), chalk.gray('...'), chalk.bold.green('Done'))
		} else {
			console.log(chalk.gray('Processing Placeholders on'), chalk.cyan(file.name), chalk.gray('...'), chalk.bold.yellow('Skipped'))
		}
	}
}