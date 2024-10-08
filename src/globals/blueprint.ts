import yaml from "js-yaml"
import { version as pckgVersion } from "../../package.json"
import { number, system } from "@rjweb/utils"
import { BlueprintConfig, conf } from "src/types/blueprint/conf"
import * as fs from "fs"
import chalk from "chalk"
import path from "path"

type RawBlueprintConfig = {
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
		views?: string
		controllers?: string
		app?: string
		routers?: {
			client?: string
			application?: string
			web?: string
		}
	}

	admin: {
		view: string
		controller?: string
		css?: string
		wrapper?: string
	}

	dashboard?: {
		css?: string
		wrapper?: string
		components?: string
	}

	data?: {
		public?: string
		directory?: string
		console?: string
	}

	database?: {
		migrations?: string
	}
}

export function config(raw: string) {
	const data = yaml.load(raw) as RawBlueprintConfig

	return conf.parse(data)
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

	if (conf.info.flags?.includes('forceLegacyPlaceholders') || conf.info.target.includes('indev-') || conf.info.target.includes('alpha-')) {
		const placeholders: Record<string, string> = {
			'version': conf.info.version,
			'author': conf.info.author ?? 'null',
			'name': conf.info.name,
			'identifier': conf.info.identifier,

			'path': process.cwd(),
			'datapath': `${process.cwd()}/.blueprint/extensions/${conf.info.identifier}/private`,
			'publicpath': `${process.cwd()}/.blueprint/extensions/${conf.info.identifier}/public`,
			'installmode': 'normal',
			'blueprintversion': `ainx@${pckgVersion}`,
			'timestamp': Math.floor(Date.now() / 1000).toString()
		}

		return input.replace(/(\^#[^\n\r# ]+#\^)/g, (match) => placeholders[match.slice(2, -2)] ?? match)
			.replace(/(__[^\n\r_ ]+__)/g, (match) => placeholders[match.slice(2, -2)] ?? match)
	} else {
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
			'{root/data}': `${process.cwd()}/.blueprint/extensions/${conf.info.identifier}/private`,

			'{webroot}': '/',
			'{webroot/public}': `/extensions/${conf.info.identifier}`,
			'{webroot/fs}': `/fs/extensions/${conf.info.identifier}`
		}

		return input.replace(/\{[^\n\r ]*?\}/g, (match) => placeholders[match] ?? match)
	}
}

export async function recursivePlaceholders(conf: BlueprintConfig, dir: string, dirLabel = '') {
	if (conf.info.flags?.includes('ignorePlaceholders')) return

	for await (const file of await fs.promises.opendir(dir)) {
		if (file.isDirectory()) {
			await recursivePlaceholders(conf, path.join(dir, file.name), `${dirLabel}${file.name}/`)

			continue
		}

		const content = await fs.promises.readFile(`${dir}/${file.name}`),
			label = `${dirLabel}${file.name}`

		console.log(chalk.gray('Processing Placeholders on'), chalk.cyan(label), chalk.gray('...'))

		if (content.includes(Buffer.from([0]))) {
			console.error(chalk.gray('Processing Placeholders on'), chalk.cyan(label), chalk.gray('...'), chalk.bold.red('Binary'))
			continue
		}

		const string = content.toString(),
			text = placeholders(conf, string)

		if (text !== string) {
			await fs.promises.writeFile(`${dir}/${file.name}`, text)

			console.log(chalk.gray('Processing Placeholders on'), chalk.cyan(label), chalk.gray('...'), chalk.bold.green('Done'))
		} else {
			console.log(chalk.gray('Processing Placeholders on'), chalk.cyan(label), chalk.gray('...'), chalk.bold.yellow('Skipped'))
		}
	}
}

export async function applyPermissions() {
	console.log(chalk.gray('Applying Permissions ...'))

	await system.execute('chmod -R 755 storage/* bootstrap/cache', { async: true }).catch(() => null)

	const users = ['www-data', 'nginx', 'apache']

	for (const user of users) {
		console.log(chalk.gray('Applying Permissions as'), chalk.cyan(user), chalk.gray('...'))

		try {
			await system.execute(`chown -R ${user}:${user} /var/www/pterodactyl/*`, { async: true })
			await system.execute(`chown -R ${user}:${user} /var/www/pterodactyl/.*`, { async: true })

			console.log(chalk.gray('Applying Permissions as'), chalk.cyan(user), chalk.gray('...'), chalk.bold.green('Done'))
			break
		} catch {
			console.log(chalk.gray('Applying Permissions as'), chalk.cyan(user), chalk.gray('...'), chalk.bold.red('Failed'))
		}
	}

	console.log(chalk.gray('Applying Permissions ...'), chalk.bold.green('Done'))
}

export async function updateBlueprintCache() {
	const php = `
		use Illuminate\\Support\\Facades\\DB;

		$cache = DB::table('settings')->where('key', 'blueprint::cache')->first();

		if ($cache) {
			DB::table('settings')->where('key', 'blueprint::cache')->update(['value' => '${Math.floor(Date.now() / 1000)}']);
		} else {
			DB::table('settings')->insert(['key' => 'blueprint::cache', 'value' => '${Math.floor(Date.now() / 1000)}']);
		}
	`

	await fs.promises.writeFile('.blueprint/__ainx__tmp.php', php)

	console.log(chalk.gray('Updating Blueprint Cache ...'))

	await system.execute('php artisan tinker -n < .blueprint/__ainx__tmp.php', { async: true }).catch(() => null)

	await fs.promises.rm('.blueprint/__ainx__tmp.php')

	console.log(chalk.gray('Updating Blueprint Cache ...'), chalk.bold.green('Done'))
}

import BlueprintAdminLibrary from "src/compat/app/BlueprintFramework/Libraries/ExtensionLibrary/Admin/BlueprintAdminLibrary.php"
import BlueprintClientLibrary from "src/compat/app/BlueprintFramework/Libraries/ExtensionLibrary/Client/BlueprintClientLibrary.php"
import BlueprintConsoleLibrary from "src/compat/app/BlueprintFramework/Libraries/ExtensionLibrary/Console/BlueprintConsoleLibrary.php"

import ScriptLibraryGrabEnv from "src/compat/scripts/libraries/grabenv.sh"
import ScriptLibraryLogFormat from "src/compat/scripts/libraries/logFormat.sh"
import ScriptLibraryParseYaml from "src/compat/scripts/libraries/parse_yaml.sh"

export async function insertCompatFiles() {
	console.log(chalk.gray('Inserting Compatibility Files ...'))

	const paths: Record<string, string> = {
		'app/BlueprintFramework/Libraries/ExtensionLibrary/Admin/BlueprintAdminLibrary.php': BlueprintAdminLibrary,
		'app/BlueprintFramework/Libraries/ExtensionLibrary/Client/BlueprintClientLibrary.php': BlueprintClientLibrary,
		'app/BlueprintFramework/Libraries/ExtensionLibrary/Console/BlueprintConsoleLibrary.php': BlueprintConsoleLibrary,

		'scripts/libraries/grabenv.sh': ScriptLibraryGrabEnv,
		'scripts/libraries/logFormat.sh': ScriptLibraryLogFormat,
		'scripts/libraries/parse_yaml.sh': ScriptLibraryParseYaml,
		'.blueprint/lib/grabenv.sh': ScriptLibraryGrabEnv,
		'.blueprint/lib/logFormat.sh': ScriptLibraryLogFormat,
		'.blueprint/lib/parse_yaml.sh': ScriptLibraryParseYaml
	}

	for (const [ path, content ] of Object.entries(paths)) {
		const dir = path.split('/').slice(0, -1).join('/')

		if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true })

		await fs.promises.writeFile(path, content)
	}

	console.log(chalk.gray('Inserting Compatibility Files ...'), chalk.bold.green('Done'))
}