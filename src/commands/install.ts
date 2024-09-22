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

export type Args = {
	file: string
	force: boolean
	rebuild: boolean
	skipSteps: boolean
}

export default async function install(args: Args, skipRoutes: boolean = false) {
	if (!args.file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.cyan('.ainx'))
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
		process.exit(1)
	}

	const log = intercept()

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
			console.log(chalk.gray('Update using:'), chalk.cyan('npm i -g ainx'))
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

		if (conf.requests?.controllers) {
			console.log(chalk.gray('Linking controllers'), chalk.cyan(conf.requests.controllers), chalk.gray('...'))

			await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}/controllers`, { recursive: true })
			await fs.promises.cp(path.join('/tmp/ainx/addon', conf.requests.controllers), `.blueprint/extensions/${data.data.id}/controllers`, { recursive: true })

			await fs.promises.mkdir('app/BlueprintFramework/Extensions', { recursive: true })
			await fs.promises.symlink(path.join(process.cwd(), '.blueprint/extensions', data.data.id, 'controllers'), path.join(process.cwd(), 'app/BlueprintFramework/Extensions', data.data.id))

			await blueprint.recursivePlaceholders(conf, `app/BlueprintFramework/Extensions/${data.data.id}`)

			console.log(chalk.gray('Linking controllers'), chalk.cyan(conf.requests.controllers), chalk.gray('...'), chalk.bold.green('Done'))
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

					console.log(chalk.yellow('Adding dashboard route'), chalk.green(step.path), chalk.yellow('...'))
					console.log(chalk.gray('If you are using a theme you should manually add the route to prevent icon issues.'))
					console.log(chalk.gray('Please consult your theme creator on how to add routes, optimally the instructions here should work fine.'))

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

					let router: string
					if (fs.existsSync('resources/scripts/routers/routes.ts')) router = await fs.promises.readFile('resources/scripts/routers/routes.ts', 'utf-8')
					else router = await fs.promises.readFile('resources/scripts/routers/routes.tsx', 'utf-8')

					const importLine = `import ${step.component} from '${step.componentPath}';`
					if (!router.includes(importLine)) {
						const lines = router.split('\n')
						lines.splice(4, 0, importLine)
						router = lines.join('\n')
					}

					if (fs.existsSync('resources/scripts/routers/routes.ts')) await fs.promises.writeFile('resources/scripts/routers/routes.ts', router)
					else await fs.promises.writeFile('resources/scripts/routers/routes.tsx', router)

					console.log(chalk.red.bold('Add the following route manually in a seperate terminal:'))
					console.log(chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.ts`))
					console.log(chalk.gray('or'), chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.tsx`))
					console.log()
					console.log(chalk.gray(newRoute))
					console.log()
					console.log(chalk.yellow('Example:'))
					console.log()
					console.log(chalk.gray(afterRoute))
					console.log(chalk.gray(newRoute))
					console.log()

					const { done } = await enquirer.prompt<{ done: boolean }>({
						type: 'confirm',
						name: 'done',
						message: 'Done?'
					})

					if (!done) {
						console.log(chalk.yellow('Cancelled'))
						process.exit(1)
					}

					break
				}
			}
		}

		if (conf.database?.migrations) {
			const files = await fs.promises.readdir(`database/migrations-${data.data.id}`).then((files) => files.length)

			console.log(chalk.gray('Running'), chalk.cyan(files), chalk.gray('migration(s) ...'))

			system.execute(`php artisan migrate --force --path=database/migrations-${data.data.id}`)

			console.log(chalk.gray('Running'), chalk.cyan(files), chalk.gray('migration(s) ...'), chalk.bold.green('Done'))
		}

		if (args.rebuild) await rebuild({})

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

		if (!args.force) await log.ask()

		process.exit(1)
	}
}