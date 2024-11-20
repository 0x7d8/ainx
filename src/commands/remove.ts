import chalk from "chalk"
import fs from "fs"
import enquirer from "enquirer"
import { filesystem, system } from "@rjweb/utils"
import cp from "child_process"
import rebuild from "src/commands/rebuild"
import * as blueprint from "src/globals/blueprint"
import path from "path"
import { intercept } from "src/globals/log"
import * as ainx from "src/globals/ainx"
import os from "os"

export type Args = {
	addons: string[]
	rebuild: boolean
	force: boolean
	migrate: boolean
	skipSteps: boolean
	disableSmoothMode: boolean
	excludeFlags: string[]
}

export default async function remove(args: Args, skipRoutes: boolean = false): Promise<number> {
	if (!args.addons.length) {
		console.error(chalk.red('No addons provided'))
		return 1
	}

	if (args.addons.length !== 1) {
		const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
			type: 'confirm',
			name: 'confirm',
			message: `Remove ${args.addons.length} addons?`
		})

		if (!confirm) {
			console.log(chalk.yellow('Cancelled'))
			return 0
		}

		console.log(chalk.gray('Removing'), chalk.cyan(args.addons.length), chalk.gray('addons ...'))

		for (const addon of args.addons) {
			await remove({ ...args, addons: [addon], rebuild: false, force: true })
		}

		if (args.rebuild) await rebuild({ disableSmoothMode: args.disableSmoothMode })

		console.log(chalk.gray('Removing'), chalk.cyan(args.addons.length), chalk.gray('addons ...'), chalk.bold.green('Done'))

		return 0
	}

	let addon = args.addons[0].replace('.ainx', '')

	const yarn = await system.execute('yarn --version', { async: true }).catch(() => null)
	if (!yarn) {
		console.error(chalk.red('Yarn is required to remove addons'))
		console.error(chalk.gray('Install yarn using:'), chalk.cyan('npm i -g yarn'))
		return 1
	}

	if (!fs.existsSync('yarn.lock')) {
		console.error(chalk.red('Yarn lock file not found'))
		console.error(chalk.red('Please navigate to the pterodactyl panel root directory before running ainx.'))
		console.error(chalk.gray('Example:'), chalk.cyan('cd /var/www/pterodactyl'))
		return 1
	}

	if (!fs.existsSync(`.blueprint/extensions/${addon}`)) {
		console.error(chalk.red('Addon is not installed'))
		return 1
	}

	const log = intercept()

	try {
		const [ data, conf, zip ] = ainx.parse(`.blueprint/extensions/${addon}/${addon}.ainx`, args.excludeFlags)
		if (!zip.test()) {
			console.error(chalk.red('Invalid ainx file'))
			return 1
		}

		if (!args.force) {
			const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: `Remove ${conf.info.name}?`
			})

			if (!confirm) {
				console.log(chalk.yellow('Cancelled'))
				return 0
			}
		}

		const start = Date.now()

		console.log(chalk.gray('Removing Addon'), chalk.cyan(data.id), chalk.gray('...'))
		console.log()

		ainx.unpack(zip, path.join(os.tmpdir(), 'ainx'))

		console.log(chalk.gray('Addon Name:'), chalk.cyan(conf.info.name))
		console.log(chalk.gray('Addon Version:'), chalk.cyan(conf.info.version))
		if (conf.info.author) console.log(chalk.gray('Addon Author:'), chalk.cyan(conf.info.author))
		console.log()

		{
			console.log(chalk.gray('Removing admin view'), chalk.cyan(conf.admin.view), chalk.gray('...'))

			await Promise.allSettled([
				fs.promises.rm(`public/assets/extensions/${data.id}`, { recursive: true }),
				fs.promises.rm(`resources/views/admin/extensions/${data.id}`, { recursive: true })
			])

			console.log(chalk.gray('Removing admin view'), chalk.cyan(conf.admin.view), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.admin.controller) {
			console.log(chalk.gray('Removing admin controller'), chalk.cyan(conf.admin.controller), chalk.gray('...'))

			await fs.promises.rm(`app/Http/Controllers/Admin/Extensions/${data.id}`, { recursive: true }).catch(() => null)

			console.log(chalk.gray('Removing admin controller'), chalk.cyan(conf.admin.controller), chalk.gray('...'), chalk.bold.green('Done'))
		}

		await fs.promises.rm(`storage/extensions/${data.id}`, { recursive: true }).catch(() => null)
		await fs.promises.rm(`storage/.extensions/${data.id}`, { recursive: true }).catch(() => null)

		if (conf.data?.public) {
			const publicStat = await fs.promises.stat(`public/extensions/${data.id}`).catch(() => null)
			if (publicStat?.isSymbolicLink() || publicStat?.isDirectory()) await fs.promises.rm(`public/extensions/${data.id}`, { recursive: true })
		}

		if (conf.admin.css) {
			console.log(chalk.gray('Removing admin css'), chalk.cyan(conf.admin.css), chalk.gray('...'))

			await filesystem.replace('resources/views/layouts/admin.blade.php', `\n    <link rel="stylesheet" href="/extensions/${data.id}/_assets/admin.style.css?t={{ \\Illuminate\\Support\\Facades\\DB::table('settings')->where('key', 'blueprint::cache')->first()->value }}">`, '')

			console.log(chalk.gray('Removing admin css'), chalk.cyan(conf.admin.css), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.dashboard?.css) {
			console.log(chalk.gray('Removing dashboard css'), chalk.cyan(conf.dashboard.css), chalk.gray('...'))

			await filesystem.replace('resources/views/templates/wrapper.blade.php', `\n    <link rel="stylesheet" href="/extensions/${data.id}/_assets/dashboard.style.css?t={{ \\Illuminate\\Support\\Facades\\DB::table('settings')->where('key', 'blueprint::cache')->first()->value }}">`, '')
		}

		if (conf.admin.wrapper) {
			console.log(chalk.gray('Removing admin wrapper'), chalk.cyan(conf.admin.wrapper), chalk.gray('...'))

			await fs.promises.rm(`resources/views/blueprint/admin/wrappers/${data.id}.blade.php`, { recursive: true }).catch(() => null)

			console.log(chalk.gray('Removing admin wrapper'), chalk.cyan(conf.admin.wrapper), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.dashboard?.wrapper) {
			console.log(chalk.gray('Removing dashboard wrapper'), chalk.cyan(conf.dashboard.wrapper), chalk.gray('...'))

			await fs.promises.rm(`resources/views/blueprint/dashboard/wrappers/${data.id}.blade.php`, { recursive: true }).catch(() => null)

			console.log(chalk.gray('Removing dashboard wrapper'), chalk.cyan(conf.dashboard.wrapper), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.data?.directory) {
			if (fs.existsSync(`.blueprint/extensions/${data.id}/private/remove.sh`)) {
				const cmd = cp.spawn('bash', [`.blueprint/extensions/${data.id}/private/remove.sh`], {
					stdio: 'inherit',
					cwd: process.cwd(),
					env: {
						...process.env,
						...blueprint.environment(conf)
					}
				})

				await new Promise((resolve) => cmd.on('close', resolve))
			}
		}

		if (conf.data?.console) {
			console.log(chalk.gray('Removing console files'), chalk.cyan(conf.data.console), chalk.gray('...'))

			await fs.promises.rm(`app/Console/Commands/BlueprintFramework/Extensions/${data.id}`, { recursive: true }).catch(() => null)
			await fs.promises.rm(`app/BlueprintFramework/Schedules/${data.id}Schedules.php`, { recursive: true }).catch(() => null)

			console.log(chalk.gray('Removing console files'), chalk.cyan(conf.data.console), chalk.gray('...'), chalk.bold.green('Done'))
		}

		{
			console.log(chalk.gray('Removing admin routes'), chalk.cyan(`routes/admin-${data.id}.php`), chalk.gray('...'))

			await Promise.allSettled([
				fs.promises.rm(`routes/admin-${data.id}.php`),
				filesystem.replace('routes/admin.php', `\ninclude 'admin-${data.id}.php';`, '')
			])

			console.log(chalk.gray('Removing admin routes'), chalk.cyan(`routes/admin-${data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.client) {
			console.log(chalk.gray('Removing client router'), chalk.cyan(`routes/client-${data.id}.php`), chalk.gray('...'))

			await Promise.allSettled([
				fs.promises.rm(`routes/client-${data.id}.php`),
				fs.promises.rm(`routes/blueprint/client/${data.id}.php`),
				filesystem.replace('routes/api-client.php', `\ninclude 'client-${data.id}.php';`, '')
			])

			await filesystem.replace('routes/api-client.php', `\nRoute::prefix('/extensions/${data.id}')->group(base_path('routes/client-${data.id}.php'));`, '').catch(() => null)

			console.log(chalk.gray('Removing client router'), chalk.cyan(`routes/client-${data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.application) {
			console.log(chalk.gray('Removing application router'), chalk.cyan(`routes/api-application.php`), chalk.gray('...'))

			await Promise.allSettled([
				fs.promises.rm(`routes/application-${data.id}.php`),
				fs.promises.rm(`routes/blueprint/application/${data.id}.php`),
				filesystem.replace('routes/api-application.php', `\ninclude 'application-${data.id}.php';`, '')
			])

			await filesystem.replace('routes/api-application.php', `\nRoute::prefix('/extensions/${data.id}')->group(base_path('routes/application-${data.id}.php'));`, '').catch(() => null)

			console.log(chalk.gray('Removing application router'), chalk.cyan(`routes/api-application.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.web) {
			console.log(chalk.gray('Removing base router'), chalk.cyan(`routes/base-${data.id}.php`), chalk.gray('...'))

			await Promise.allSettled([
				fs.promises.rm(`routes/base-${data.id}.php`),
				fs.promises.rm(`routes/blueprint/web/${data.id}.php`),
				filesystem.replace('routes/base.php', `\ninclude 'base-${data.id}.php';`, '')
			])

			await filesystem.replace('routes/base.php', `\nRoute::prefix('/extensions/${data.id}')->group(base_path('routes/base-${data.id}.php'));`, '').catch(() => null)

			console.log(chalk.gray('Removing base router'), chalk.cyan(`routes/base-${data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.app) {
			console.log(chalk.gray('Removing app'), chalk.cyan(`app/BlueprintFramework/Extensions/${data.id}`), chalk.gray('...'))

			await fs.promises.rm(`app/BlueprintFramework/Extensions/${data.id}`, { recursive: true }).catch(() => null)

			console.log(chalk.gray('Removing app'), chalk.cyan(`app/BlueprintFramework/Extensions/${data.id}`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.views) {
			console.log(chalk.gray('Removing views'), chalk.cyan(`resources/views/${data.id}`), chalk.gray('...'))

			await fs.promises.rm(`resources/views/blueprint/extensions/${data.id}`, { recursive: true }).catch(() => null)

			console.log(chalk.gray('Removing views'), chalk.cyan(`resources/views/${data.id}`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.database?.migrations && fs.existsSync(`database/migrations-${data.id}`) && args.migrate) {
			console.log(chalk.gray('Rolling back migrations'), chalk.cyan(`database/migrations-${data.id}`), chalk.gray('...'))

			await system.execute(`php artisan migrate:rollback --force --path=database/migrations-${data.id}`, { async: true })
			await fs.promises.rm(`database/migrations-${data.id}`, { recursive: true })

			console.log(chalk.gray('Rolling back migrations'), chalk.cyan(`database/migrations-${data.id}`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (!args.skipSteps) for (const step of data.installation.filter((step) => (step.type as any) === 'dashboard-route').concat(data.removal ?? [])) {
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

					const isTsx = fs.existsSync('resources/scripts/routers/routes.tsx'),
						importLine = `import ${step.component} from '${step.componentPath}';`

					console.log(chalk.gray('Please edit the following file according to the below instructions:'))
					console.log(chalk.italic.gray('(red lines are removed, white lines already exist)'))
					console.log(chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.ts${isTsx ? 'x' : ''}`))
					console.log()
					console.log(chalk.gray('[...]'))
					console.log()
					console.log(chalk.white('import DatabasesContainer from \'@/components/server/databases/DatabasesContainer\';'))
					console.log(chalk.white('import ScheduleContainer from \'@/components/server/schedules/ScheduleContainer\';'))
					console.log(chalk.bgRedBright.white(importLine))
					console.log(chalk.white('import UsersContainer from \'@/components/server/users/UsersContainer\';'))
					console.log()
					console.log(chalk.gray('[...]'))
					console.log()
					console.log(chalk.white(afterRoute))
					console.log(chalk.bgRedBright.white(newRoute))
					console.log()
					console.log(chalk.gray('[...]'))

					const { done } = await enquirer.prompt<{ done: boolean }>({
						type: 'confirm',
						name: 'done',
						message: 'Done?'
					})

					if (!done) {
						console.log(chalk.yellow('Cancelled'))
						return 1
					}

					break
				}
			}
		}

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

		try {
			system.execute('php artisan queue:restart')
		} catch { }

		await blueprint.updateBlueprintCache()

		await fs.promises.rm(`.blueprint/extensions/${addon}`, { recursive: true })

		console.log(chalk.gray('Removing Addon'), chalk.cyan(data.id), chalk.gray('...'), chalk.bold.green('Done'))
		console.log(chalk.italic.gray(`Took ${Date.now() - start}ms`))

		if (!args.force) await log.ask()
	} catch (err: any) {
		console.error(chalk.red(String(err?.stack ?? err)))
		console.error(chalk.red('Invalid ainx file'))

		if (!args.force) await log.ask()

		return 1
	} finally {
		await fs.promises.rm(path.join(os.tmpdir(), 'ainx', 'addon'), { recursive: true, force: true })
	}

	return 0
}