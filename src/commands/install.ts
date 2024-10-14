import chalk from "chalk"
import fs from "fs"
import enquirer from "enquirer"
import AdmZip from "adm-zip"
import { version as pckgVersion } from "../../package.json"
import { manifest } from "src/types/manifest"
import path from "path"
import { filesystem, system } from "@rjweb/utils"
import cp from "child_process"
import rebuild from "src/commands/rebuild"
import semver from "semver"
import * as blueprint from "src/globals/blueprint"
import { intercept } from "src/globals/log"

import ExtensionController from "src/compat/app/Http/Controllers/Admin/ExtensionController.php"
import BladeIndex from "src/compat/resources/views/admin/extensions/index.blade.php"
import Admin from "src/compat/routes/admin.php"

export type Args = {
	file: string
	force: boolean
	rebuild: boolean
	skipSteps: boolean
	generateFromBlueprint: boolean
	disableSmoothMode: boolean
}

export default async function install(args: Args, skipRoutes: boolean = false) {
	if (args.generateFromBlueprint ? !args.file.endsWith('.blueprint') : !args.file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.cyan(args.generateFromBlueprint ? '.blueprint' : '.ainx'))
		process.exit(1)
	}

	if (!fs.existsSync(args.file)) {
		console.error(chalk.red('File does not exist'))
		process.exit(1)
	}

	const yarn = await system.execute('yarn --version', { async: true }).catch(() => null)
	if (!yarn) {
		console.error(chalk.red('Yarn is required to install addons'))
		console.error(chalk.gray('Install yarn using:'), chalk.cyan('npm i -g yarn'))
		process.exit(1)
	}

	if (!fs.existsSync('yarn.lock')) {
		console.error(chalk.red('Yarn lock file not found'))
		console.error(chalk.red('Please navigate to the pterodactyl panel root directory before running ainx.'))
		console.error(chalk.gray('Example:'), chalk.cyan('cd /var/www/pterodactyl'))
		process.exit(1)
	}

	const log = intercept()

	if (args.generateFromBlueprint) {
		console.log(chalk.gray('Generating ainx file from blueprint file ...'))

		const file = args.file
		args.file = file.replace('.blueprint', '.ainx')

		const bpZip = new AdmZip(file)
		const config = blueprint.config(bpZip.readAsText('conf.yml'))

		const ainxZip = new AdmZip()
		ainxZip.addLocalFile(file, undefined, 'addon.blueprint')
		ainxZip.addFile('manifest.json', Buffer.from(JSON.stringify({
			id: config.info.identifier,
			installation: []
		})))

		const buffer = await ainxZip.toBufferPromise()

		await fs.promises.writeFile(args.file, buffer)

		console.log(chalk.gray('Generating ainx file from blueprint file ...'), chalk.bold.green('Done'))
		console.log()
		console.log(chalk.red.bold('THE GENERATED AINX FILE IS HIGHLY EXPERIMENTAL AND MAY NOT WORK PROPERLY. DO NOT'))
		console.log(chalk.red.bold('CONTACT ADDON AUTHOR FOR SUPPORT IF YOU USE THIS FEATURE, USE AT YOUR OWN RISK!!'))
		console.log(chalk.red.bold('PLEASE CHECK THE COMPATIBILITY SECTION:'))
		console.log(chalk.underline.blue('https://github.com/0x7d8/ainx/?tab=readme-ov-file#blueprint-compatibility'))
	}

	try {
		const zip = new AdmZip(args.file)
		if (!zip.test()) {
			console.error(chalk.red('Invalid ainx file'))
			process.exit(1)
		}

		const data = manifest.safeParse(JSON.parse(zip.readAsText('manifest.json')))
		if (!data.success) {
			console.error(chalk.red('Invalid ainx file'))
			process.exit(1)
		}

		if (semver.gt(data.data.ainxRequirement, pckgVersion)) {
			console.error(chalk.red('Ainx version requirement not met'))
			console.log(chalk.gray('Update using:'), chalk.cyan('npm i -g ainx@latest'))
			console.log(chalk.gray('Required:'), chalk.cyan(data.data.ainxRequirement))
			console.log(chalk.gray('Current:'), chalk.cyan(pckgVersion))
			process.exit(1)
		}

		if (data.data.hasRemove && fs.existsSync(data.data.hasRemove)) {
			console.error(chalk.red('Addon has a remove script, you may need to remove the addon first before installing with ainx'))
			console.error(chalk.cyan(`bash ${data.data.hasRemove}`))
		}

		if (fs.existsSync(`.blueprint/extensions/${data.data.id}/${data.data.id}.ainx`) && !args.force) {
			console.error(chalk.red('Addon already installed, upgrade instead'))
			process.exit(1)
		}

		if (!args.force) {
			const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: `Install ${data.data.id}?`
			})

			if (!confirm) {
				console.log(chalk.yellow('Cancelled'))
				process.exit(0)
			}
		}

		const start = Date.now()

		console.log(chalk.gray('Installing'), chalk.cyan(data.data.id), chalk.gray('...'))
		console.log()

		const bpZip = new AdmZip(zip.readFile('addon.blueprint') ?? undefined)

		bpZip.extractAllTo('/tmp/ainx/addon', true)
		const conf = blueprint.config(bpZip.readAsText('conf.yml'))

		console.log(chalk.gray('Addon Name:'), chalk.cyan(conf.info.name))
		console.log(chalk.gray('Addon Version:'), chalk.cyan(conf.info.version))
		if (conf.info.author) console.log(chalk.gray('Addon Author:'), chalk.cyan(conf.info.author))
		console.log()

		await blueprint.insertCompatFiles()

		const storageStat = await fs.promises.lstat(`storage/extensions/${data.data.id}`).catch(() => null)
		if (storageStat?.isSymbolicLink() || storageStat?.isDirectory()) {
			await fs.promises.rm(`storage/extensions/${data.data.id}`, { recursive: true, force: true })
		}

		console.log(chalk.gray('Linking storage files'), chalk.cyan(data.data.id), chalk.gray('...'))

		await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}/fs`, { recursive: true })
		await fs.promises.mkdir('storage/extensions', { recursive: true })
		await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.data.id, 'fs'), path.join(process.cwd(), 'storage/extensions', data.data.id))

		console.log(chalk.gray('Linking storage files'), chalk.cyan(data.data.id), chalk.gray('...'), chalk.bold.green('Done'))

		const publicStat = await fs.promises.lstat(`public/extensions/${data.data.id}`).catch(() => null)
		if (publicStat?.isSymbolicLink() || publicStat?.isDirectory()) {
			await fs.promises.rm(`public/extensions/${data.data.id}`, { recursive: true, force: true })
		}

		if (conf.admin.controller) {
			console.log(chalk.gray('Adding admin controller'), chalk.cyan(conf.admin.controller), chalk.gray('...'))

			await fs.promises.mkdir(`app/Http/Controllers/Admin/Extensions/${data.data.id}`, { recursive: true })
			const content = await fs.promises.readFile(path.join('/tmp/ainx/addon', conf.admin.controller), 'utf-8')

			await fs.promises.writeFile(`app/Http/Controllers/Admin/Extensions/${data.data.id}/${data.data.id}ExtensionController.php`, blueprint.placeholders(conf, content))

			console.log(chalk.gray('Adding admin controller'), chalk.cyan(conf.admin.controller), chalk.gray('...'), chalk.bold.green('Done'))
		} else {
			console.log(chalk.gray('Adding default admin controller'), chalk.cyan(conf.admin.controller), chalk.gray('...'))

			await fs.promises.mkdir(`app/Http/Controllers/Admin/Extensions/${data.data.id}`, { recursive: true })

			await fs.promises.writeFile(`app/Http/Controllers/Admin/Extensions/${data.data.id}/${data.data.id}ExtensionController.php`, ExtensionController.replaceAll('__identifier__', data.data.id))

			console.log(chalk.gray('Adding default admin controller'), chalk.cyan(conf.admin.controller), chalk.gray('...'), chalk.bold.green('Done'))
		}

		{
			console.log(chalk.gray('Adding admin view'), chalk.cyan(conf.admin.view), chalk.gray('...'))

			await fs.promises.mkdir(`resources/views/admin/extensions/${data.data.id}`, { recursive: true })
			const content = await fs.promises.readFile(path.join('/tmp/ainx/addon', conf.admin.view), 'utf-8')

			let icon = ''
			if (conf.info.icon) {
				await fs.promises.mkdir(`public/assets/extensions/${data.data.id}`, { recursive: true })
				await fs.promises.cp(path.join('/tmp/ainx/addon', conf.info.icon), `public/assets/extensions/${data.data.id}/${conf.info.icon}`)

				icon = `/assets/extensions/${data.data.id}/${conf.info.icon}`
			} else {
				icon = 'https://raw.githubusercontent.com/BlueprintFramework/framework/refs/heads/main/blueprint/assets/Extensions/Defaults/1.jpg'
			}

			await fs.promises.writeFile(
				`resources/views/admin/extensions/${data.data.id}/index.blade.php`,
				blueprint.placeholders(conf, BladeIndex.replace('__description__', conf.info.description).replace('__icon__', icon).replace('__content__', content))
			)

			console.log(chalk.gray('Adding admin view'), chalk.cyan(conf.admin.view), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.data?.public) {
			console.log(chalk.gray('Linking public files'), chalk.cyan(conf.data.public), chalk.gray('...'))

			await fs.promises.cp(path.join('/tmp/ainx/addon', conf.data.public), path.join('.blueprint/extensions', data.data.id, 'public'), { recursive: true })
			await fs.promises.mkdir('public/extensions', { recursive: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.data.id, 'public'), path.join(process.cwd(), 'public/extensions', data.data.id),)
			await blueprint.recursivePlaceholders(conf, path.join('.blueprint/extensions', data.data.id, 'public'))

			console.log(chalk.gray('Linking public files'), chalk.cyan(conf.data.public), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.admin.css) {
			console.log(chalk.gray('Applying admin css'), chalk.cyan(conf.admin.css), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}/assets`, { recursive: true })
			const content = await fs.promises.readFile(path.join('/tmp/ainx/addon', conf.admin.css), 'utf-8')

			await fs.promises.writeFile(`.blueprint/extensions/${data.data.id}/assets/admin.style.css`, blueprint.placeholders(conf, content))
			await filesystem.replace('resources/views/layouts/admin.blade.php', '</body>', `</body>\n    <link rel="stylesheet" href="/extensions/${data.data.id}/_assets/admin.style.css?t={{ \\Illuminate\\Support\\Facades\\DB::table('settings')->where('key', 'blueprint::cache')->first()->value }}">`)

			const assetsStat = await fs.promises.stat(`public/extensions/${data.data.id}/_assets`).catch(() => null)
			if (!assetsStat?.isSymbolicLink() && !assetsStat?.isDirectory()) await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.data.id, 'assets'), path.join(process.cwd(), 'public/extensions', data.data.id, '_assets'))

			console.log(chalk.gray('Applying admin css'), chalk.cyan(conf.admin.css), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.dashboard?.css) {
			console.log(chalk.gray('Applying dashboard css'), chalk.cyan(conf.dashboard.css), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}/assets`, { recursive: true })
			const content = await fs.promises.readFile(path.join('/tmp/ainx/addon', conf.dashboard.css), 'utf-8')

			await fs.promises.writeFile(`.blueprint/extensions/${data.data.id}/assets/dashboard.style.css`, blueprint.placeholders(conf, content))
			await filesystem.replace('resources/views/templates/wrapper.blade.php', '</body>', `</body>\n    <link rel="stylesheet" href="/extensions/${data.data.id}/_assets/dashboard.style.css?t={{ \\Illuminate\\Support\\Facades\\DB::table('settings')->where('key', 'blueprint::cache')->first()->value }}">`)

			const assetsStat = await fs.promises.stat(`public/extensions/${data.data.id}/_assets`).catch(() => null)
			if (!assetsStat?.isSymbolicLink() && !assetsStat?.isDirectory()) await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.data.id, 'assets'), path.join(process.cwd(), 'public/extensions', data.data.id, '_assets'))

			console.log(chalk.gray('Applying dashboard css'), chalk.cyan(conf.dashboard.css), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.admin.wrapper) {
			console.log(chalk.gray('Applying admin wrapper'), chalk.cyan(conf.admin.wrapper), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}/_wrappers`, { recursive: true })
			const content = await fs.promises.readFile(path.join('/tmp/ainx/addon', conf.admin.wrapper), 'utf-8')

			await fs.promises.writeFile(`.blueprint/extensions/${data.data.id}/_wrappers/admin.blade.php`, blueprint.placeholders(conf, content))

			await fs.promises.mkdir('resources/views/blueprint/admin/wrappers', { recursive: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.data.id, '_wrappers', 'admin.blade.php'), path.join(process.cwd(), 'resources/views/blueprint/admin/wrappers', `${data.data.id}.blade.php`))

			console.log(chalk.gray('Applying admin wrapper'), chalk.cyan(conf.admin.wrapper), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.dashboard?.wrapper) {
			console.log(chalk.gray('Applying dashboard wrapper'), chalk.cyan(conf.dashboard.wrapper), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}/_wrappers`, { recursive: true })
			const content = await fs.promises.readFile(path.join('/tmp/ainx/addon', conf.dashboard.wrapper), 'utf-8')

			await fs.promises.writeFile(`.blueprint/extensions/${data.data.id}/_wrappers/dashboard.blade.php`, blueprint.placeholders(conf, content))

			await fs.promises.mkdir('resources/views/blueprint/dashboard/wrappers', { recursive: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.data.id, '_wrappers', 'dashboard.blade.php'), path.join(process.cwd(), 'resources/views/blueprint/dashboard/wrappers', `${data.data.id}.blade.php`))

			console.log(chalk.gray('Applying dashboard wrapper'), chalk.cyan(conf.dashboard.wrapper), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.data?.directory) {
			console.log(chalk.gray('Copying private files'), chalk.cyan(conf.data.directory), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}`, { recursive: true })
			await fs.promises.cp(path.join('/tmp/ainx/addon', conf.data.directory), `.blueprint/extensions/${data.data.id}/private`, { recursive: true })

			await blueprint.recursivePlaceholders(conf, `.blueprint/extensions/${data.data.id}/private`)

			if (conf.info.flags?.includes('hasInstallScript') && fs.existsSync(`.blueprint/extensions/${data.data.id}/private/install.sh`)) {
				const cmd = cp.spawn('bash', [`.blueprint/extensions/${data.data.id}/private/install.sh`], {
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
			console.log(chalk.gray('Adding admin router'), chalk.cyan(data.data.id), chalk.gray('...'))

			await fs.promises.appendFile('routes/admin.php', `\ninclude 'admin-${data.data.id}.php';`)

			await fs.promises.writeFile(`routes/admin-${data.data.id}.php`, Admin.replaceAll('__identifier__', data.data.id))

			console.log(chalk.gray('Adding admin router'), chalk.cyan(data.data.id), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.client && !fs.existsSync(`routes/client-${data.data.id}.php`)) {
			console.log(chalk.gray('Adding client router'), chalk.cyan(`routes/client-${data.data.id}.php`), chalk.gray('...'))

			await fs.promises.appendFile('routes/api-client.php', `\ninclude 'client-${data.data.id}.php';`)

			const client = bpZip.readAsText(conf.requests.routers.client)
				.replace('\'prefix\' => \'', `'prefix' => '/extensions/${data.data.id}`)

			await fs.promises.writeFile(`routes/client-${data.data.id}.php`, blueprint.placeholders(conf, client))

			console.log(chalk.gray('Adding client router'), chalk.cyan(`routes/client-${data.data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.application && !fs.existsSync(`routes/application-${data.data.id}.php`)) {
			console.log(chalk.gray('Adding application router'), chalk.cyan(`routes/application-${data.data.id}.php`), chalk.gray('...'))

			await fs.promises.appendFile('routes/api-application.php', `\ninclude 'application-${data.data.id}.php';`)

			const application = bpZip.readAsText(conf.requests.routers.application)
				.replace('\'prefix\' => \'', `'prefix' => '/extensions/${data.data.id}`)

			await fs.promises.writeFile(`routes/application-${data.data.id}.php`, blueprint.placeholders(conf, application))

			console.log(chalk.gray('Adding application router'), chalk.cyan(`routes/application-${data.data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.web && !fs.existsSync(`routes/base-${data.data.id}.php`)) {
			console.log(chalk.gray('Adding base router'), chalk.gray(`routes/base-${data.data.id}.php`), chalk.gray('...'))

			await fs.promises.appendFile('routes/base.php', `\ninclude 'base-${data.data.id}.php';`)

			const web = bpZip.readAsText(conf.requests.routers.web)
				.replace('\'prefix\' => \'', `'prefix' => '/extensions/${data.data.id}`)

			await fs.promises.writeFile(`routes/base-${data.data.id}.php`, blueprint.placeholders(conf, web))

			console.log(chalk.gray('Adding base router'), chalk.gray(`routes/base-${data.data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		const controllerStat = await fs.promises.lstat(`app/BlueprintFramework/Extensions/${data.data.id}`).catch(() => null)
		if (controllerStat?.isDirectory() || controllerStat?.isSymbolicLink()) {
			await fs.promises.rm(`app/BlueprintFramework/Extensions/${data.data.id}`, { recursive: true, force: true })
		}

		if (conf.requests?.app) {
			console.log(chalk.gray('Linking app'), chalk.cyan(conf.requests.app), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}/app`, { recursive: true })
			await fs.promises.cp(path.join('/tmp/ainx/addon', conf.requests.app), `.blueprint/extensions/${data.data.id}/app`, { recursive: true })

			await fs.promises.mkdir('app/BlueprintFramework/Extensions', { recursive: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.data.id, 'app'), path.join(process.cwd(), 'app/BlueprintFramework/Extensions', data.data.id))

			await blueprint.recursivePlaceholders(conf, `app/BlueprintFramework/Extensions/${data.data.id}`)

			console.log(chalk.gray('Linking app'), chalk.cyan(conf.requests.app), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.views) {
			console.log(chalk.gray('Linking views'), chalk.cyan(conf.requests.views), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}/_views`, { recursive: true })
			await fs.promises.cp(path.join('/tmp/ainx/addon', conf.requests.views), `.blueprint/extensions/${data.data.id}/_views`, { recursive: true })

			await fs.promises.mkdir('resources/views/blueprint/extensions', { recursive: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.data.id, '_views'), path.join(process.cwd(), 'resources/views/blueprint/extensions', data.data.id))

			await blueprint.recursivePlaceholders(conf, `resources/views/blueprint/extensions/${data.data.id}`)

			console.log(chalk.gray('Linking views'), chalk.cyan(conf.requests.views), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.database?.migrations && !fs.existsSync(`database/migrations-${data.data.id}`)) {
			console.log(chalk.gray('Copying migrations'), chalk.cyan(conf.database.migrations), chalk.gray('...'))

			await fs.promises.mkdir(`database/migrations-${data.data.id}`, { recursive: true })

			const migrations = await fs.promises.readdir(path.join('/tmp/ainx/addon', conf.database.migrations))
			for (const migration of migrations) {
				const content = await fs.promises.readFile(path.join('/tmp/ainx/addon', conf.database.migrations, migration))

				await fs.promises.writeFile(`database/migrations-${data.data.id}/${migration}`, content)
			}

			console.log(chalk.gray('Copying migrations'), chalk.cyan(conf.database.migrations), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (!args.skipSteps) for (const step of data.data.installation) {
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
					if (skipRoutes) break

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

					let router = await fs.promises.readFile(isTsx ? 'resources/scripts/routers/routes.tsx' : 'resources/scripts/routers/routes.ts', 'utf-8')

					const importLine = `import ${step.component} from '${step.componentPath}';`
					if (!router.includes(importLine)) {
						const lines = router.split('\n')
						lines.splice(4, 0, importLine)
						router = lines.join('\n')
					}

					if (!isTsx) await fs.promises.writeFile('resources/scripts/routers/routes.ts', router)
					else await fs.promises.writeFile('resources/scripts/routers/routes.tsx', router)

					console.log(chalk.gray('Please edit the following file according to the below instructions:'))
					console.log(chalk.italic.gray('(green lines are added, white lines already exist)'))
					console.log(chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.ts${isTsx ? 'x' : ''}`))
					console.log()
					console.log(chalk.gray('[...]'))
					console.log()
					console.log(chalk.white('import DatabasesContainer from \'@/components/server/databases/DatabasesContainer\';'))
					console.log(chalk.white('import ScheduleContainer from \'@/components/server/schedules/ScheduleContainer\';'))
					console.log(chalk.bgGreenBright.white(importLine))
					console.log(chalk.white('import UsersContainer from \'@/components/server/users/UsersContainer\';'))
					console.log()
					console.log(chalk.gray('[...]'))
					console.log()
					console.log(chalk.white(afterRoute))
					console.log(chalk.bgGreenBright.white(newRoute))
					console.log()
					console.log(chalk.gray('[...]'))

					const { done } = await enquirer.prompt<{ done: boolean }>({
						type: 'confirm',
						name: 'done',
						message: 'Has the route been added? (say no to continue later)'
					})

					if (!done) {
						console.log(chalk.yellow('Cancelled, apply the route and run this command again.'))
						process.exit(1)
					}

					break
				}
			}
		}

		if (conf.database?.migrations) {
			const files = await fs.promises.readdir(`database/migrations-${data.data.id}`).then((files) => files.length)

			await blueprint.recursivePlaceholders(conf, `database/migrations-${data.data.id}`)

			console.log(chalk.gray('Running'), chalk.cyan(files), chalk.gray('migration(s) ...'))

			system.execute(`php artisan migrate --force --path=database/migrations-${data.data.id}`)

			console.log(chalk.gray('Running'), chalk.cyan(files), chalk.gray('migration(s) ...'), chalk.bold.green('Done'))
		}

		if (args.rebuild) await rebuild({
			disableSmoothMode: args.disableSmoothMode
		})

		await fs.promises.rm('/tmp/ainx/addon', { recursive: true })
		try {
			system.execute('php artisan optimize')
		}	catch { }

		await blueprint.updateBlueprintCache()
		await blueprint.applyPermissions()

		if (!fs.existsSync(`.blueprint/extensions/${data.data.id}`)) await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}`, { recursive: true })
		await fs.promises.cp(args.file, `.blueprint/extensions/${data.data.id}/${data.data.id}.ainx`)

		console.log(chalk.gray('Installing'), chalk.cyan(data.data.id), chalk.gray('...'), chalk.bold.green('Done'))
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

		process.exit(1)
	}
}