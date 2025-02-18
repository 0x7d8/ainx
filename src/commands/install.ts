import chalk from "chalk"
import fs from "fs"
import os from "os"
import enquirer from "enquirer"
import AdmZip from "adm-zip"
import { version as pckgVersion } from "../../package.json"
import path from "path"
import { filesystem, number, string, system } from "@rjweb/utils"
import cp from "child_process"
import rebuild from "src/commands/rebuild"
import backupCreate from "src/commands/backup/create"
import semver from "semver"
import * as blueprint from "src/globals/blueprint"
import { intercept } from "src/globals/log"
import * as ainx from "src/globals/ainx"

import ExtensionCommand from "src/compat/app/Console/Commands/BlueprintFramework/Extensions/ExtensionCommand.php"
import ExtensionController from "src/compat/app/Http/Controllers/Admin/ExtensionController.php"
import BladeIndex from "src/compat/resources/views/admin/extensions/index.blade.php"
import Admin from "src/compat/routes/admin.php"

export type Args = {
	files: string[]
	force: boolean
	rebuild: boolean
	skipSteps: boolean
	generateFromBlueprint: boolean
	disableSmoothMode: boolean
	applyPermissions: boolean
	excludeFlags: string[]
}

function exists(file: string): boolean {
	try {
		const stat = fs.lstatSync(file)

		return stat.isFile() || stat.isDirectory() || stat.isSymbolicLink()
	} catch {
		return false
	}
}

export default async function install(args: Args, skipRoutes: boolean = false): Promise<number> {
	if (!args.files.length) {
		console.error(chalk.red('No files provided'))
		return 1
	}

	if (!args.force) {
		await backupCreate({})
	}

	if (args.files.length !== 1) {
		const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
			type: 'confirm',
			name: 'confirm',
			message: `Install ${args.files.length} addons?`
		})

		if (!confirm) {
			console.log(chalk.yellow('Cancelled'))
			return 0
		}

		console.log(chalk.gray('Installing'), chalk.cyan(args.files.length), chalk.gray('addons ...'))

		for (const file of args.files) {
			await install({ ...args, files: [file], force: true, rebuild: false, applyPermissions: false })
		}

		if (args.rebuild) await rebuild({ disableSmoothMode: args.disableSmoothMode })
		if (args.applyPermissions) await blueprint.applyPermissions()

		console.log(chalk.gray('Installing'), chalk.cyan(args.files.length), chalk.gray('addons ...'), chalk.bold.green('Done'))

		return 0
	}

	let file = args.files[0]

	if (args.generateFromBlueprint ? !file.endsWith('.blueprint') : !file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.cyan(args.generateFromBlueprint ? '.blueprint' : '.ainx'))
		return 1
	}

	if (!fs.existsSync(file)) {
		console.error(chalk.red('File does not exist'))
		return 1
	}

	const bash = blueprint.bash()
	if (!bash) {
		console.error(chalk.red('Bash is required to install addons'))
		console.error(chalk.gray('Install bash using:'), chalk.cyan('apt install bash'))
		console.error(chalk.gray('Or on Windows:'), chalk.cyan('https://git-scm.com/download/win'))
		return 1
	}

	const yarn = await system.execute('yarn --version', { async: true }).catch(() => null)
	if (!yarn) {
		console.error(chalk.red('Yarn is required to install addons'))
		console.error(chalk.gray('Install yarn using:'), chalk.cyan('npm i -g yarn'))
		return 1
	}

	if (!fs.existsSync('yarn.lock')) {
		console.error(chalk.red('Yarn lock file not found'))
		console.error(chalk.red('Please navigate to the pterodactyl panel root directory before running ainx.'))
		console.error(chalk.gray('Example:'), chalk.cyan('cd /var/www/pterodactyl'))
		return 1
	}

	const log = intercept()

	if (args.generateFromBlueprint) {
		console.log(chalk.gray('Generating ainx file from blueprint file ...'))

		const bpZip = new AdmZip(file),
			config = blueprint.config(bpZip.readAsText('conf.yml'), args.excludeFlags)

		const ainxZip = new AdmZip()
		ainxZip.addLocalFile(file, undefined, 'addon.blueprint')
		ainxZip.addFile('manifest.json', Buffer.from(JSON.stringify({
			id: config.info.identifier,
			installation: []
		})))

		file = file.replace('.blueprint', '.ainx')

		const buffer = await ainxZip.toBufferPromise()
		await fs.promises.writeFile(file, buffer)

		console.log(chalk.gray('Generating ainx file from blueprint file ...'), chalk.bold.green('Done'))
		console.log()
		console.log(chalk.red.bold('THE GENERATED AINX FILE IS HIGHLY EXPERIMENTAL AND MAY NOT WORK PROPERLY. DO NOT'))
		console.log(chalk.red.bold('CONTACT ADDON AUTHOR FOR SUPPORT IF YOU USE THIS FEATURE, USE AT YOUR OWN RISK!!'))
		console.log(chalk.red.bold('PLEASE CHECK THE COMPATIBILITY SECTION:'))
		console.log(chalk.underline.blue('https://github.com/0x7d8/ainx/?tab=readme-ov-file#blueprint-compatibility'))
	}

	try {
		const [ data, conf, zip ] = ainx.parse(file)
		if (!zip.test()) {
			console.error(chalk.red('Invalid ainx file'))
			return 1
		}

		if (semver.gt(data.ainxRequirement, pckgVersion)) {
			console.error(chalk.red('Ainx version requirement not met'))
			console.log(chalk.gray('Required:'), chalk.cyan(data.ainxRequirement))
			console.log(chalk.gray('Current:'), chalk.cyan(pckgVersion))
			console.log(chalk.gray('Update using:'))
			console.log(chalk.cyan('npm i -g ainx@latest'))

			return 1
		}

		if (data.hasRemove && fs.existsSync(data.hasRemove)) {
			console.error(chalk.red('Addon has a remove script, you may need to remove the addon first before installing with ainx'))
			console.error(chalk.cyan(`bash ${data.hasRemove}`))
		}

		if (exists(`.blueprint/extensions/${data.id}/${data.id}.ainx`) && !args.force) {
			console.error(chalk.red('Addon already installed, upgrade instead'))
			console.error(chalk.gray('If you updated pterodactyl, you may want to run'), chalk.cyan(`ainx install ${file} --force`))

			return 1
		}

		if (!args.force) {
			const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: `Install ${conf.info.name}?`
			})

			if (!confirm) {
				console.log(chalk.yellow('Cancelled'))
				return 0
			}
		}

		const start = Date.now()

		console.log(chalk.gray('Installing'), chalk.cyan(data.id), chalk.gray('...'))
		console.log()

		const source = ainx.unpack(zip, path.join(os.tmpdir(), 'ainx', 'addon'))

		console.log(chalk.gray('Addon Name:'), chalk.cyan(conf.info.name))
		console.log(chalk.gray('Addon Version:'), chalk.cyan(conf.info.version))
		if (conf.info.author) console.log(chalk.gray('Addon Author:'), chalk.cyan(conf.info.author))
		console.log()

		await blueprint.insertCompatFiles()

		const storageStat = await fs.promises.lstat(`storage/extensions/${data.id}`).catch(() => null)
		if (storageStat?.isSymbolicLink() || storageStat?.isDirectory()) {
			await fs.promises.rm(`storage/extensions/${data.id}`, { recursive: true, force: true })
		}

		console.log(chalk.gray('Linking storage files'), chalk.cyan(data.id), chalk.gray('...'))

		await fs.promises.mkdir(`.blueprint/extensions/${data.id}/fs`, { recursive: true })
		await fs.promises.mkdir('storage/extensions', { recursive: true })
		await fs.promises.mkdir('public/fs', { recursive: true })
		await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, 'fs'), path.join(process.cwd(), 'storage/extensions', data.id)).catch(() => null)
		await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, 'fs'), path.join(process.cwd(), 'public/fs', data.id)).catch(() => null)

		await fs.promises.mkdir(`.blueprint/extensions/${data.id}/private`, { recursive: true })
		await fs.promises.mkdir('storage/.extensions', { recursive: true })
		await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, 'private'), path.join(process.cwd(), 'storage/.extensions', data.id)).catch(() => null)

		console.log(chalk.gray('Linking storage files'), chalk.cyan(data.id), chalk.gray('...'), chalk.bold.green('Done'))

		console.log(chalk.gray('Adding store files ...'))

		await fs.promises.cp(source.path(), `.blueprint/extensions/${data.id}/private/.store`, { recursive: true, force: true })

		console.log(chalk.gray('Adding store files ...'), chalk.bold.green('Done'))

		const publicStat = await fs.promises.lstat(`public/extensions/${data.id}`).catch(() => null)
		if (publicStat?.isSymbolicLink() || publicStat?.isDirectory()) {
			await fs.promises.rm(`public/extensions/${data.id}`, { recursive: true, force: true })
		}

		if (conf.admin.controller) {
			console.log(chalk.gray('Adding admin controller'), chalk.cyan(conf.admin.controller), chalk.gray('...'))

			await fs.promises.mkdir(`app/Http/Controllers/Admin/Extensions/${data.id}`, { recursive: true })
			const content = await fs.promises.readFile(path.join(source.path(), conf.admin.controller), 'utf-8')

			await fs.promises.writeFile(`app/Http/Controllers/Admin/Extensions/${data.id}/${data.id}ExtensionController.php`, blueprint.placeholders(conf, content))

			console.log(chalk.gray('Adding admin controller'), chalk.cyan(conf.admin.controller), chalk.gray('...'), chalk.bold.green('Done'))
		} else {
			console.log(chalk.gray('Adding default admin controller'), chalk.gray('...'))

			await fs.promises.mkdir(`app/Http/Controllers/Admin/Extensions/${data.id}`, { recursive: true })
			await fs.promises.writeFile(`app/Http/Controllers/Admin/Extensions/${data.id}/${data.id}ExtensionController.php`, ExtensionController.replaceAll('__identifier__', data.id))

			console.log(chalk.gray('Adding default admin controller'), chalk.gray('...'), chalk.bold.green('Done'))
		}

		{
			console.log(chalk.gray('Adding admin view'), chalk.cyan(conf.admin.view), chalk.gray('...'))

			await fs.promises.mkdir(`resources/views/admin/extensions/${data.id}`, { recursive: true })
			const content = await fs.promises.readFile(path.join(source.path(), conf.admin.view), 'utf-8')

			let icon: string
			if (conf.info.icon) {
				if (exists(`public/assets/extensions/${data.id}`)) await fs.promises.rm(`public/assets/extensions/${data.id}`, { recursive: true })

				await fs.promises.mkdir(`public/assets/extensions/${data.id}`, { recursive: true })
				await fs.promises.cp(path.join(source.path(), conf.info.icon), `public/assets/extensions/${data.id}/${conf.info.icon}`)

				icon = `/assets/extensions/${data.id}/${conf.info.icon}`
			} else {
				icon = `https://raw.githubusercontent.com/BlueprintFramework/framework/refs/heads/main/blueprint/assets/Extensions/Defaults/${number.generate(1, 5)}.jpg`
			}

			const placeholders: Record<string, string> = {
				__identifier__: data.id,
				__name__: conf.info.name.replaceAll('"', '\\"'),
				__version__: conf.info.version,
				__description__: conf.info.description.replaceAll('"', '\\"'),
				__icon__: icon,
				__content__: blueprint.placeholders(conf, content)
			}

			await fs.promises.writeFile(
				`resources/views/admin/extensions/${data.id}/index.blade.php`,
				BladeIndex.replace(/__identifier__|__name__|__version__|__description__|__icon__|__content__/g, (match) => placeholders[match])
			)

			console.log(chalk.gray('Adding admin view'), chalk.cyan(conf.admin.view), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.data?.console) {
			console.log(chalk.gray('Copying console files'), chalk.cyan(conf.data.console), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.id}/console/functions`, { recursive: true })
			await fs.promises.cp(path.join(source.path(), conf.data.console), path.join(process.cwd(), '.blueprint/extensions', data.id, 'console/functions'), { recursive: true })

			await blueprint.recursivePlaceholders(conf, `.blueprint/extensions/${data.id}/console/functions`)

			if (exists(`.blueprint/extensions/${data.id}/console/functions/Console.yml`)) {
				const config = blueprint.consoleConfig(await fs.promises.readFile(`.blueprint/extensions/${data.id}/console/functions/Console.yml`, 'utf-8'))

				await fs.promises.mkdir(`app/Console/Commands/BlueprintFramework/Extensions/${data.id}`, { recursive: true })
				await fs.promises.mkdir('app/BlueprintFramework/Schedules', { recursive: true })

				let schedules = '<?php\n\n'
				for (const command of config) {
					const call = blueprint.intervalToCall(command)

					if (call) {
						schedules += `$schedule->command('${data.id}:${command.Signature}')${call};\n`
					}

					const random = string.generate()
					await fs.promises.writeFile(
						`app/Console/Commands/BlueprintFramework/Extensions/${data.id}/${random}Command.php`,
						ExtensionCommand.replace('__random__', random).replaceAll('__identifier__', data.id)
							.replaceAll('__signature__', command.Signature).replaceAll('__description__', command.Description)
							.replaceAll('__file__', command.Path)
					)
				}

				await fs.promises.writeFile(`app/BlueprintFramework/Schedules/${data.id}Schedules.php`, schedules)
			}

			console.log(chalk.gray('Copying console files'), chalk.cyan(conf.data.console), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.data?.public) {
			console.log(chalk.gray('Linking public files'), chalk.cyan(conf.data.public), chalk.gray('...'))

			await fs.promises.cp(path.join(source.path(), conf.data.public), path.join('.blueprint/extensions', data.id, 'public'), { recursive: true })

			await fs.promises.mkdir('public/extensions', { recursive: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, 'public'), path.join(process.cwd(), 'public/extensions', data.id),)

			await blueprint.recursivePlaceholders(conf, path.join('.blueprint/extensions', data.id, 'public'))

			console.log(chalk.gray('Linking public files'), chalk.cyan(conf.data.public), chalk.gray('...'), chalk.bold.green('Done'))
		} else {
			console.log(chalk.gray('Linking default public files'), chalk.gray('...'))

			await fs.promises.mkdir(`public/extensions/${data.id}`, { recursive: true })

			console.log(chalk.gray('Linking default public files'), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.admin.css) {
			console.log(chalk.gray('Applying admin css'), chalk.cyan(conf.admin.css), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.id}/assets`, { recursive: true })
			const content = await fs.promises.readFile(path.join(source.path(), conf.admin.css), 'utf-8')

			await fs.promises.writeFile(`.blueprint/extensions/${data.id}/assets/admin.style.css`, blueprint.placeholders(conf, content))
			await filesystem.replace('resources/views/layouts/admin.blade.php', '</body>', `</body>\n    <link rel="stylesheet" href="/extensions/${data.id}/_assets/admin.style.css?t={{ \\Illuminate\\Support\\Facades\\DB::table('settings')->where('key', 'blueprint::cache')->first()->value }}">`)

			const assetsStat = await fs.promises.stat(`public/extensions/${data.id}/_assets`).catch(() => null)
			if (!assetsStat?.isSymbolicLink() && !assetsStat?.isDirectory()) await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, 'assets'), path.join(process.cwd(), 'public/extensions', data.id, '_assets'))

			console.log(chalk.gray('Applying admin css'), chalk.cyan(conf.admin.css), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.dashboard?.css) {
			console.log(chalk.gray('Applying dashboard css'), chalk.cyan(conf.dashboard.css), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.id}/assets`, { recursive: true })
			const content = await fs.promises.readFile(path.join(source.path(), conf.dashboard.css), 'utf-8')

			await fs.promises.writeFile(`.blueprint/extensions/${data.id}/assets/dashboard.style.css`, blueprint.placeholders(conf, content))
			await filesystem.replace('resources/views/templates/wrapper.blade.php', '</body>', `</body>\n    <link rel="stylesheet" href="/extensions/${data.id}/_assets/dashboard.style.css?t={{ \\Illuminate\\Support\\Facades\\DB::table('settings')->where('key', 'blueprint::cache')->first()->value }}">`)

			const assetsStat = await fs.promises.stat(`public/extensions/${data.id}/_assets`).catch(() => null)
			if (!assetsStat?.isSymbolicLink() && !assetsStat?.isDirectory()) await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, 'assets'), path.join(process.cwd(), 'public/extensions', data.id, '_assets'))

			console.log(chalk.gray('Applying dashboard css'), chalk.cyan(conf.dashboard.css), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.admin.wrapper) {
			console.log(chalk.gray('Applying admin wrapper'), chalk.cyan(conf.admin.wrapper), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.id}/_wrappers`, { recursive: true })
			const content = await fs.promises.readFile(path.join(source.path(), conf.admin.wrapper), 'utf-8')

			await fs.promises.writeFile(`.blueprint/extensions/${data.id}/_wrappers/admin.blade.php`, blueprint.placeholders(conf, content))

			await fs.promises.mkdir('resources/views/blueprint/admin/wrappers', { recursive: true })
			if (exists(`resources/views/blueprint/admin/wrappers/${data.id}.blade.php`)) await fs.promises.rm(`resources/views/blueprint/admin/wrappers/${data.id}.blade.php`, { force: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, '_wrappers', 'admin.blade.php'), path.join(process.cwd(), 'resources/views/blueprint/admin/wrappers', `${data.id}.blade.php`))

			console.log(chalk.gray('Applying admin wrapper'), chalk.cyan(conf.admin.wrapper), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.dashboard?.wrapper) {
			console.log(chalk.gray('Applying dashboard wrapper'), chalk.cyan(conf.dashboard.wrapper), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.id}/_wrappers`, { recursive: true })
			const content = await fs.promises.readFile(path.join(source.path(), conf.dashboard.wrapper), 'utf-8')

			await fs.promises.writeFile(`.blueprint/extensions/${data.id}/_wrappers/dashboard.blade.php`, blueprint.placeholders(conf, content))

			await fs.promises.mkdir('resources/views/blueprint/dashboard/wrappers', { recursive: true })
			if (exists(`resources/views/blueprint/dashboard/wrappers/${data.id}.blade.php`)) await fs.promises.rm(`resources/views/blueprint/dashboard/wrappers/${data.id}.blade.php`, { force: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, '_wrappers', 'dashboard.blade.php'), path.join(process.cwd(), 'resources/views/blueprint/dashboard/wrappers', `${data.id}.blade.php`))

			console.log(chalk.gray('Applying dashboard wrapper'), chalk.cyan(conf.dashboard.wrapper), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.data?.directory) {
			console.log(chalk.gray('Copying private files'), chalk.cyan(conf.data.directory), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.id}`, { recursive: true })
			await fs.promises.cp(path.join(source.path(), conf.data.directory), `.blueprint/extensions/${data.id}/private`, { recursive: true })

			await blueprint.recursivePlaceholders(conf, `.blueprint/extensions/${data.id}/private`)

			if (fs.existsSync(`.blueprint/extensions/${data.id}/private/install.sh`)) {
				const cmd = cp.spawn(bash, [`.blueprint/extensions/${data.id}/private/install.sh`], {
					stdio: 'inherit',
					cwd: process.cwd(),
					env: {
						...process.env,
						...blueprint.environment(conf)
					}
				})

				await new Promise((resolve) => cmd.on('close', resolve))
			}

			console.log(chalk.gray('Copying private files'), chalk.cyan(conf.data.directory), chalk.gray('...'), chalk.bold.green('Done'))
		}

		{
			console.log(chalk.gray('Adding admin router'), chalk.cyan(data.id), chalk.gray('...'))

			if (await fs.promises.readFile('routes/admin.php', 'utf-8').then((content) => !content.includes(`include 'admin-${data.id}.php';`)).catch(() => true)) {
				await fs.promises.appendFile('routes/admin.php', `\ninclude 'admin-${data.id}.php';`)
			}

			await fs.promises.writeFile(`routes/admin-${data.id}.php`, Admin.replaceAll('__identifier__', data.id))

			console.log(chalk.gray('Adding admin router'), chalk.cyan(data.id), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.client) {
			console.log(chalk.gray('Adding client router'), chalk.cyan(`routes/client-${data.id}.php`), chalk.gray('...'))

			const router = blueprint.placeholders(conf, await fs.promises.readFile(path.join(source.path(), conf.requests.routers.client), 'utf-8'))
			await fs.promises.writeFile(`routes/client-${data.id}.php`, router)

			const content = await fs.promises.readFile('routes/api-client.php', 'utf-8')
			if (!content.includes(`Route::prefix('/extensions/${data.id}')->group(base_path('routes/client-${data.id}.php'));`)) {
				await fs.promises.writeFile(
					'routes/api-client.php',
					`${content}\nRoute::prefix('/extensions/${data.id}')->group(base_path('routes/client-${data.id}.php'));`
				)
			}

			console.log(chalk.gray('Adding client router'), chalk.cyan(`routes/client-${data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.application) {
			console.log(chalk.gray('Adding application router'), chalk.cyan(`routes/application-${data.id}.php`), chalk.gray('...'))

			const router = blueprint.placeholders(conf, await fs.promises.readFile(path.join(source.path(), conf.requests.routers.application), 'utf-8'))
			await fs.promises.writeFile(`routes/application-${data.id}.php`, router)

			const content = await fs.promises.readFile('routes/api-application.php', 'utf-8')
			if (!content.includes(`Route::prefix('/extensions/${data.id}')->group(base_path('routes/application-${data.id}.php'));`)) {
				await fs.promises.writeFile(
					'routes/api-application.php',
					`${content}\nRoute::prefix('/extensions/${data.id}')->group(base_path('routes/application-${data.id}.php'));`
				)
			}

			console.log(chalk.gray('Adding application router'), chalk.cyan(`routes/application-${data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.web) {
			console.log(chalk.gray('Adding base router'), chalk.gray(`routes/base-${data.id}.php`), chalk.gray('...'))

			const router = blueprint.placeholders(conf, await fs.promises.readFile(path.join(source.path(), conf.requests.routers.web), 'utf-8'))
			await fs.promises.writeFile(`routes/base-${data.id}.php`, router)

			const content = await fs.promises.readFile('routes/base.php', 'utf-8')
			if (!content.includes(`Route::prefix('/extensions/${data.id}')->group(base_path('routes/base-${data.id}.php'));`)) {
				await fs.promises.writeFile(
					'routes/base.php',
					`${content}\nRoute::prefix('/extensions/${data.id}')->group(base_path('routes/base-${data.id}.php'));`
				)
			}

			console.log(chalk.gray('Adding base router'), chalk.gray(`routes/base-${data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		const controllerStat = await fs.promises.lstat(`app/BlueprintFramework/Extensions/${data.id}`).catch(() => null)
		if (controllerStat?.isDirectory() || controllerStat?.isSymbolicLink()) {
			await fs.promises.rm(`app/BlueprintFramework/Extensions/${data.id}`, { recursive: true, force: true })
		}

		if (conf.requests?.app) {
			console.log(chalk.gray('Linking app'), chalk.cyan(conf.requests.app), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.id}/app`, { recursive: true })
			await fs.promises.cp(path.join(source.path(), conf.requests.app), `.blueprint/extensions/${data.id}/app`, { recursive: true })

			await fs.promises.mkdir('app/BlueprintFramework/Extensions', { recursive: true })
			if (exists(`app/BlueprintFramework/Extensions/${data.id}`)) await fs.promises.rm(`app/BlueprintFramework/Extensions/${data.id}`, { force: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, 'app'), path.join(process.cwd(), 'app/BlueprintFramework/Extensions', data.id))

			await blueprint.recursivePlaceholders(conf, `app/BlueprintFramework/Extensions/${data.id}`)

			console.log(chalk.gray('Linking app'), chalk.cyan(conf.requests.app), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.views) {
			console.log(chalk.gray('Linking views'), chalk.cyan(conf.requests.views), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.id}/_views`, { recursive: true })
			await fs.promises.cp(path.join(source.path(), conf.requests.views), `.blueprint/extensions/${data.id}/_views`, { recursive: true })

			await fs.promises.mkdir('resources/views/blueprint/extensions', { recursive: true })
			if (exists(`resources/views/blueprint/extensions/${data.id}`)) await fs.promises.rm(`resources/views/blueprint/extensions/${data.id}`, { force: true, recursive: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.id, '_views'), path.join(process.cwd(), 'resources/views/blueprint/extensions', data.id))

			await blueprint.recursivePlaceholders(conf, `resources/views/blueprint/extensions/${data.id}`)

			console.log(chalk.gray('Linking views'), chalk.cyan(conf.requests.views), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.database?.migrations) {
			console.log(chalk.gray('Copying migrations'), chalk.cyan(conf.database.migrations), chalk.gray('...'))

			await fs.promises.mkdir(`database/migrations-${data.id}`, { recursive: true })
			await fs.promises.cp(path.join(source.path(), conf.database.migrations), `database/migrations-${data.id}`, { recursive: true })

			console.log(chalk.gray('Copying migrations'), chalk.cyan(conf.database.migrations), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (!args.skipSteps) for (const step of data.installation) {
			switch (step.type) {
				case "copy": {
					console.log(chalk.gray('Copying'), chalk.cyan(step.source), chalk.gray('to'), chalk.cyan(step.destination), chalk.gray('...'))

					if (fs.statSync(step.source).isDirectory()) {
						if (!fs.existsSync(step.destination)) await fs.promises.mkdir(step.destination, { recursive: true })

						await fs.promises.cp(step.source, step.destination, { recursive: true })
						await blueprint.recursivePlaceholders(conf, step.destination)
					} else {
						if (!fs.existsSync(path.dirname(step.destination))) await fs.promises.mkdir(path.dirname(step.destination), { recursive: true })

						const content = await fs.promises.readFile(step.source, 'utf-8')
						await fs.promises.writeFile(step.destination, blueprint.placeholders(conf, content))
					}

					console.log(chalk.gray('Copying'), chalk.cyan(step.source), chalk.gray('to'), chalk.cyan(step.destination), chalk.gray('...'), chalk.bold.green('Done'))

					break
				}

				case "remove": {
					console.log(chalk.gray('Removing'), chalk.cyan(step.path), chalk.gray('...'))

					try {
						await fs.promises.rm(step.path, { recursive: true })
					} catch { }

					console.log(chalk.gray('Removing'), chalk.cyan(step.path), chalk.gray('...'), chalk.bold.green('Done'))

					break
				}

				case "replace": {
					console.log(chalk.gray('Replacing in'), chalk.cyan(step.file), chalk.gray('...'))

					const content = await fs.promises.readFile(step.file, 'utf-8'),
						replaceContent = step.newline ? `${step.replace}\n` : step.replace

					if (step.unique && !step.matches && content.includes(step.replace)) break
					else if (step.unique && step.matches && step.matches.some((match) => content.includes(match))) break

					const replaced = step.global
						? content.replaceAll(step.search, replaceContent)
						: content.replace(step.search, replaceContent)

					await fs.promises.writeFile(step.file, replaced)

					console.log(chalk.gray('Replacing in'), chalk.cyan(step.file), chalk.gray('...'), chalk.bold.green('Done'))

					break
				}

				case "dashboard-route": {
					if (skipRoutes) continue

					console.log(chalk.yellow('Manual Intervention Required ...'))
					console.log()
					console.log(chalk.bold.red('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@'))
					console.log(chalk.bold.red('@  PLEASE READ CAREFULLY, DO NOT SKIP  @'))
					console.log(chalk.bold.red('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@'))
					console.log()

					const newRoute = [
						'        {',
						`            path: '${step.path}',`,
						`            name: '${step.name}',`,
						`            permission: '${step.permission}',`,
						`            component: ${step.component},`,
						'        },'
					].join('\n')

					const afterRoute = [
						'        {',
						`            path: '${step.after.path}',`,
						`            name: '${step.after.name}',`,
						`            permission: '${step.after.permission}',`,
						`            component: ${step.after.component},`,
						'        },'
					].join('\n')

					const isTsx = fs.existsSync('resources/scripts/routers/routes.tsx')

					console.log(chalk.gray('Please edit the following file according to the below instructions:'))
					console.log(chalk.italic.gray('(green lines are added, white lines already exist)'))
					console.log(chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.ts${isTsx ? 'x' : ''}`))
					console.log()
					console.log(chalk.gray('[...]'))
					console.log()
					console.log(chalk.white('import DatabasesContainer from \'@/components/server/databases/DatabasesContainer\';'))
					console.log(chalk.white('import ScheduleContainer from \'@/components/server/schedules/ScheduleContainer\';'))
					console.log(chalk.bgGreenBright.white(`import ${step.component} from '${step.componentPath}';`))
					console.log(chalk.white('import UsersContainer from \'@/components/server/users/UsersContainer\';'))
					console.log()
					console.log(chalk.gray('[...]'))
					console.log()
					console.log(chalk.white(afterRoute))
					console.log(chalk.bgGreenBright.white(newRoute))
					console.log()
					console.log(chalk.gray('[...]'))

					console.log()
					console.log(chalk.bold.red('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@'))
					console.log(chalk.bold.red('@  PLEASE READ ABOVE CAREFULLY, DO NOT SKIP  @'))
					console.log(chalk.bold.red('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@'))

					const { done } = await enquirer.prompt<{ done: boolean }>({
						type: 'confirm',
						name: 'done',
						message: 'Did you add the route? THIS IS A MANUAL STEP (say no to continue later)'
					})

					if (!done) {
						console.log(chalk.yellow('Cancelled, apply the route and run this command again.'))
						return 1
					}

					break
				}
			}
		}

		if (conf.database?.migrations) {
			const files = await fs.promises.readdir(`database/migrations-${data.id}`).then((files) => files.length)

			await blueprint.recursivePlaceholders(conf, `database/migrations-${data.id}`)

			console.log(chalk.gray('Running'), chalk.cyan(files), chalk.gray('migration(s) ...'))

			try {
				system.execute(`php artisan migrate --force --path=database/migrations-${data.id}`)
			} catch {
				console.error(chalk.red('Migration failed, please run the following command manually:'))
				console.error(chalk.cyan(`php artisan migrate --force --path=database/migrations-${data.id}`))
			}

			console.log(chalk.gray('Running'), chalk.cyan(files), chalk.gray('migration(s) ...'), chalk.bold.green('Done'))
		}

		try {
			system.execute('php artisan view:clear')
		}	catch { }

		try {
			system.execute('php artisan queue:restart')
		} catch { }

		if (args.rebuild) await rebuild({
			disableSmoothMode: args.disableSmoothMode
		}).catch(() => {
			console.error(chalk.red('Rebuild failed, please rebuild manually after fixing the issue by running:'))
			console.error(chalk.cyan('ainx rebuild'))
		})

		try {
			system.execute('php artisan config:clear')
			system.execute('php artisan route:clear')
			system.execute('php artisan cache:clear')
			system.execute('php artisan optimize')
		}	catch { }

		await blueprint.updateBlueprintCache()
		if (args.applyPermissions) await blueprint.applyPermissions()

		if (!fs.existsSync(`.blueprint/extensions/${data.id}`)) await fs.promises.mkdir(`.blueprint/extensions/${data.id}`, { recursive: true })
		await fs.promises.cp(file, `.blueprint/extensions/${data.id}/${data.id}.ainx`)

		console.log(chalk.gray('Installing'), chalk.cyan(data.id), chalk.gray('...'), chalk.bold.green('Done'))
		console.log(chalk.italic.gray(`Took ${Date.now() - start}ms`))

		if (!args.force) await log.ask()
	} catch (err: any) {
		console.error(chalk.red(String(err?.stack ?? err)))
		console.error(chalk.red('Invalid ainx file'))
		console.error(chalk.red('Addon installation failed!!!'))
		console.error(chalk.red('Please check the error message above for more information'))
		console.error(chalk.red('You can try fixing the issue by updating ainx:'))
		console.error(chalk.cyan('npm i -g ainx@latest'))

		if (!args.force) await log.ask()

		return 1
	} finally {
		await fs.promises.rm(path.join(os.tmpdir(), 'ainx', 'addon'), { recursive: true, force: true })
	}

	return 0
}