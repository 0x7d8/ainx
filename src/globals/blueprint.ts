import yaml from "js-yaml"
import { version as pckgVersion } from "../../package.json"
import { number, system } from "@rjweb/utils"
import { BlueprintConfig, conf } from "src/types/blueprint/conf"
import { consoleConf } from "src/types/blueprint/console"
import * as fs from "fs"
import chalk from "chalk"
import path from "path"
import os from "os"

export const ainxEngine = 'ainx',
	ainxCompatibility = 'beta-2024-12'

export function config(raw: string, excludedFlags: string[] = []): BlueprintConfig {
	const data = yaml.load(raw)

	const c = conf.parse(data)
	c.info.flags = c.info.flags?.filter((flag) => !excludedFlags.includes(flag))

	return c
}

export function consoleConfig(raw: string) {
	const data = yaml.load(raw)

	return consoleConf.parse(data)
}

export function bash(): string | null {
	if (os.platform() === 'win32') {
		if (fs.existsSync('C:\\Program Files\\Git\\bin\\bash.exe')) {
			return 'C:\\Program Files\\Git\\bin\\bash.exe'
		} else if (fs.existsSync('C:\\Program Files\\Git\\bin\\bash')) {
			return 'C:\\Program Files\\Git\\bin\\bash'
		}

		return null
	}

	try {
		const bash = system.execute('which bash').trim()

		return fs.existsSync(bash) ? bash : null
	} catch {
		return null
	}
}

export function environment(conf: BlueprintConfig) {
	return {
		ENGINE: ainxEngine,
		BLUEPRINT_VERSION: `ainx@${pckgVersion} ${ainxCompatibility}`,
		BLUEPRINT_DEVELOPER: 'false',
		BLUEPRINT_TMP: path.join(os.tmpdir(), 'ainx', 'addon'),
		EXTENSION_TARGET: conf.info.target,
		EXTENSION_IDENTIFIER: conf.info.identifier,
		EXTENSION_VERSION: conf.info.version,
		PTERODACTYL_DIRECTORY: process.cwd()
	}
}

export function intervalToCall(data: { Interval?: string }): string | null {
	if (!data.Interval) return null

	switch (data.Interval) {
		case "everyMinute": return '->everyMinute()'
		case "everyTwoMinutes": return '->everyTwoMinutes()'
		case "everyThreeMinutes": return '->everyThreeMinutes()'
		case "everyFourMinutes": return '->everyFourMinutes()'
		case "everyFiveMinutes": return '->everyFiveMinutes()'
		case "everyTenMinutes": return '->everyTenMinutes()'
		case "everyFifteenMinutes": return '->everyFifteenMinutes()'
		case "everyThirtyMinutes": return '->everyThirtyMinutes()'
		case "hourly": return '->hourly()'
		case "daily": return '->daily()'
		case "weekdays": return '->daily()->weekdays()'
		case "weekends": return '->daily()->weekends()'
		case "sundays": return '->daily()->sundays()'
		case "mondays": return '->daily()->mondays()'
		case "tuesdays": return '->daily()->tuesdays()'
		case "wednesdays": return '->daily()->wednesdays()'
		case "thursdays": return '->daily()->thursdays()'
		case "fridays": return '->daily()->fridays()'
		case "saturdays": return '->daily()->saturdays()'
		case "weekly": return '->weekly()'
		case "monthly": return '->monthly()'
		case "quarterly": return '->quarterly()'
		case "yearly": return '->yearly()'

		default: return `->cron('${data.Interval}')`
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
			'datapath': path.join(process.cwd(), `.blueprint/extensions/${conf.info.identifier}/private`),
			'publicpath': path.join(process.cwd(), `.blueprint/extensions/${conf.info.identifier}/public`),
			'installmode': 'normal',
			'blueprintversion': `ainx@${pckgVersion} ${ainxCompatibility}`,
			'timestamp': Math.floor(Date.now() / 1000 - process.uptime()).toString(),
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
			'{timestamp}': Math.floor(Date.now() / 1000 - process.uptime()).toString(),
			'{mode}': 'local',
			'{target}': `ainx@${pckgVersion} ${ainxCompatibility}`,
			'{is_target}': conf.info.target === ainxCompatibility ? 'true' : 'false',

			'{root}': process.cwd(),
			'{root/public}': path.join(process.cwd(), `.blueprint/extensions/${conf.info.identifier}/public`),
			'{root/data}': path.join(process.cwd(), `.blueprint/extensions/${conf.info.identifier}/private`),
			'{root/fs}': path.join(process.cwd(), `.blueprint/extensions/${conf.info.identifier}/fs`),

			'{webroot}': '/',
			'{webroot/public}': `/extensions/${conf.info.identifier}`,
			'{webroot/fs}': `/fs/extensions/${conf.info.identifier}`,

			'{engine}': ainxEngine
		}

		return input.replace(/!?\{[^\n\r ]*?\}/g, (match) => match.startsWith('!') ? match.slice(1) : placeholders[match] ?? match)
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

import BlueprintAdminTemplateView from "src/compat/resources/views/blueprint/admin/template.blade.php"
import BlueprintAdminAdminView from "src/compat/resources/views/blueprint/admin/admin.blade.php"
import BlueprintDashboardDashboardView from "src/compat/resources/views/blueprint/dashboard/dashboard.blade.php"

import AssetsBlueprintStyleCss from "src/compat/public/assets/blueprint.style.css"

import BlueprintAdminLibrary from "src/compat/app/BlueprintFramework/Libraries/ExtensionLibrary/Admin/BlueprintAdminLibrary.php"
import BlueprintClientLibrary from "src/compat/app/BlueprintFramework/Libraries/ExtensionLibrary/Client/BlueprintClientLibrary.php"
import BlueprintConsoleLibrary from "src/compat/app/BlueprintFramework/Libraries/ExtensionLibrary/Console/BlueprintConsoleLibrary.php"
import BlueprintBaseLibrary from "src/compat/app/BlueprintFramework/Libraries/ExtensionLibrary/BlueprintBaseLibrary.php"
import BlueprintGetExtensionSchedules from "src/compat/app/BlueprintFramework/GetExtensionSchedules.php"

import ScriptLibraryGrabEnv from "src/compat/scripts/libraries/grabenv.sh"
import ScriptLibraryLogFormat from "src/compat/scripts/libraries/logFormat.sh"
import ScriptLibraryParseYaml from "src/compat/scripts/libraries/parse_yaml.sh"

const ainxAddonsRoutes = `
                        <li class="header">AINX ADDONS</li>
                        @foreach (app()->make(\\Pterodactyl\\BlueprintFramework\\Libraries\\ExtensionLibrary\\Admin\\BlueprintAdminLibrary::class)->extensions() as $extension)
                            <li class="{{ !starts_with(Route::currentRouteName(), "admin.extensions.{$extension['identifier']}.index") ?: 'active' }}">
                                <a href="/admin/extensions/{{ $extension['identifier'] }}">
                                    <i class="fa fa-puzzle-piece"></i> <span>{{ $extension['name'] }}</span>
                                </a>
                            </li>
                        @endforeach
`.split('\n').slice(1, -1).join('\n')

export async function insertCompatFiles() {
	console.log(chalk.gray('Inserting Compatibility Files ...'))

	const paths: Record<string, string> = {
		'resources/views/blueprint/admin/template.blade.php': BlueprintAdminTemplateView,
		'resources/views/blueprint/admin/admin.blade.php': BlueprintAdminAdminView,
		'resources/views/blueprint/dashboard/dashboard.blade.php': BlueprintDashboardDashboardView,

		'public/assets/blueprint.style.css': AssetsBlueprintStyleCss,

		'app/BlueprintFramework/Libraries/ExtensionLibrary/Admin/BlueprintAdminLibrary.php': BlueprintAdminLibrary,
		'app/BlueprintFramework/Libraries/ExtensionLibrary/Client/BlueprintClientLibrary.php': BlueprintClientLibrary,
		'app/BlueprintFramework/Libraries/ExtensionLibrary/Console/BlueprintConsoleLibrary.php': BlueprintConsoleLibrary,
		'app/BlueprintFramework/Libraries/ExtensionLibrary/BlueprintBaseLibrary.php': BlueprintBaseLibrary,
		'app/BlueprintFramework/GetExtensionSchedules.php': BlueprintGetExtensionSchedules,

		'scripts/libraries/grabenv.sh': ScriptLibraryGrabEnv,
		'scripts/libraries/logFormat.sh': ScriptLibraryLogFormat,
		'scripts/libraries/parse_yaml.sh': ScriptLibraryParseYaml,
		'.blueprint/lib/grabenv.sh': ScriptLibraryGrabEnv,
		'.blueprint/lib/logFormat.sh': ScriptLibraryLogFormat,
		'.blueprint/lib/parse_yaml.sh': ScriptLibraryParseYaml
	}

	await fs.promises.mkdir('resources/views/blueprint/admin/wrappers', { recursive: true }).catch(() => null)
	await fs.promises.writeFile('resources/views/blueprint/admin/wrappers/.gitkeep', '').catch(() => null)
	await fs.promises.mkdir('resources/views/blueprint/dashboard/wrappers', { recursive: true }).catch(() => null)
	await fs.promises.writeFile('resources/views/blueprint/dashboard/wrappers/.gitkeep', '').catch(() => null)
	await fs.promises.mkdir('app/BlueprintFramework/Schedules', { recursive: true }).catch(() => null)
	await fs.promises.writeFile('app/BlueprintFramework/Schedules/.gitkeep', '').catch(() => null)

	for (const [ path, content ] of Object.entries(paths)) {
		const dir = path.split('/').slice(0, -1).join('/')

		if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true })

		await fs.promises.writeFile(path, content)
	}

	{
		const header = '@include(\'blueprint.admin.admin\')\n@yield(\'blueprint.lib\')\n'

		const adminLayout = await fs.promises.readFile('resources/views/layouts/admin.blade.php', 'utf-8'),
			adminLayoutLines = adminLayout.split('\n')

		if (!adminLayout.includes(header)) {
			adminLayoutLines.splice(1, 0, header)

			if (!adminLayoutLines.includes('@yield(\'blueprint.import\')')) {
				const headIndex = adminLayoutLines.findIndex((line) => line.includes('</head>'))

				adminLayoutLines.splice(headIndex, 0, '        @yield(\'blueprint.import\')')
			}

			if (!adminLayout.includes('@yield(\'blueprint.notifications\')\n@yield(\'blueprint.wrappers\')')) {
				const bodyIndex = adminLayoutLines.findIndex((line) => line.includes('</body>'))

				adminLayoutLines.splice(bodyIndex, 0, '        @yield(\'blueprint.notifications\')\n        @yield(\'blueprint.wrappers\')')
			}

			await fs.promises.writeFile('resources/views/layouts/admin.blade.php', adminLayoutLines.join('\n'))
		}
	}

	{
		const header = '@include("blueprint.dashboard.dashboard")\n@yield("blueprint.lib")\n'

		const dashboardLayout = await fs.promises.readFile('resources/views/templates/wrapper.blade.php', 'utf-8'),
			dashboardLayoutLines = dashboardLayout.split('\n')

		if (!dashboardLayout.includes(header)) {
			dashboardLayoutLines.splice(1, 0, header)

			if (!dashboardLayoutLines.includes('@yield(\'blueprint.wrappers\')')) {
				const headIndex = dashboardLayoutLines.findIndex((line) => line.includes('@yield(\'below-container\')'))

				dashboardLayoutLines.splice(headIndex + 1, 0, '            @yield(\'blueprint.wrappers\')')
			}

			await fs.promises.writeFile('resources/views/templates/wrapper.blade.php', dashboardLayoutLines.join('\n'))
		}
	}

	{
		const adminLayout = await fs.promises.readFile('resources/views/layouts/admin.blade.php', 'utf-8')

		if (!adminLayout.includes('AINX ADDONS')) {
			const adminLayoutLines = adminLayout.split('\n'),
				index = adminLayoutLines.findIndex((line) => line.includes('admin.nests'))

			if (index !== -1) {
				adminLayoutLines.splice(index + 5, 0, ainxAddonsRoutes)
			}

			await fs.promises.writeFile('resources/views/layouts/admin.blade.php', adminLayoutLines.join('\n'))
		}
	}

	{
		const consoleKernel = await fs.promises.readFile('app/Console/Kernel.php', 'utf-8')

		if (!consoleKernel.includes('GetExtensionSchedules')) {
			const consoleKernelLines = consoleKernel.split('\n'),
				index = consoleKernelLines.findIndex((line) => line.includes('config(\'activity.prune_days\'))'))

			if (index !== -1) {
				consoleKernelLines.splice(index + 3, 0, '\n        \\Pterodactyl\\BlueprintFramework\\GetExtensionSchedules::schedules($schedule);')
			}

			await fs.promises.writeFile('app/Console/Kernel.php', consoleKernelLines.join('\n'))
		}
	}

	console.log(chalk.gray('Inserting Compatibility Files ...'), chalk.bold.green('Done'))
}