import chalk from "chalk"
import fs from "fs"
import enquirer from "enquirer"
import AdmZip from "adm-zip"
import { version as pckgVersion } from "../../package.json"
import { manifest } from "src/types/manifest"
import yaml from "js-yaml"
import { filesystem, system } from "@rjweb/utils"
import cp from "child_process"
import rebuild from "src/commands/rebuild"
import * as blueprint from "src/globals/blueprint"
import path from "path"
import { intercept } from "src/globals/log"

export type Args = {
	addon: string
	rebuild: boolean
	force: boolean
	migrate: boolean
}

export default async function remove(args: Args, skipRoutes: boolean = false) {
	args.addon = args.addon.replace('.ainx', '')

	if (!fs.existsSync(`.blueprint/extensions/${args.addon}`)) {
		console.error(chalk.red('Addon is not installed'))
		process.exit(1)
	}

	const log = intercept()

	try {
		const zip = new AdmZip(`.blueprint/extensions/${args.addon}/${args.addon}.ainx`)
		if (!zip.test()) {
			console.error(chalk.red('Invalid ainx file'))
			process.exit(1)
		}

		const data = manifest.safeParse(JSON.parse(zip.readAsText('manifest.json')))
		if (!data.success) {
			console.error(chalk.red('Invalid ainx file'))
			process.exit(1)
		}

		if (!args.force) {
			const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: `Remove ${data.data.id}?`
			})

			if (!confirm) {
				console.log(chalk.yellow('Cancelled'))
				process.exit(0)
			}
		}

		const start = Date.now()

		console.log(chalk.gray('Removing Addon'), chalk.cyan(data.data.id), chalk.gray('...'))
		console.log()

		const bpZip = new AdmZip(zip.readFile('addon.blueprint') ?? undefined)

		bpZip.extractAllTo('/tmp/ainx/addon', true)
		const conf = blueprint.config(bpZip.readAsText('conf.yml'))

		console.log(chalk.gray('Addon Name:'), chalk.cyan(conf.info.name))
		console.log(chalk.gray('Addon Version:'), chalk.cyan(conf.info.version))
		if (conf.info.author) console.log(chalk.gray('Addon Author:'), chalk.cyan(conf.info.author))
		console.log()

		if (conf.data?.public) {
			const publicStat = await fs.promises.stat(`public/extensions/${data.data.id}`).catch(() => null)
			if (publicStat?.isSymbolicLink() || publicStat?.isDirectory()) await fs.promises.rm(`public/extensions/${data.data.id}`, { recursive: true })
		}

		if (conf.admin.css) {
			console.log(chalk.gray('Removing admin css'), chalk.cyan(conf.admin.css), chalk.gray('...'))

			await filesystem.replace('resources/views/layouts/admin.blade.php', `\n    <link rel="stylesheet" href="/extensions/${data.data.id}/_assets/admin.style.css?t={{ \\Illuminate\\Support\\Facades\\DB::table('settings')->where('key', 'blueprint::cache')->first()->value }}">`, '')

			console.log(chalk.gray('Removing admin css'), chalk.cyan(conf.admin.css), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.dashboard?.css) {
			console.log(chalk.gray('Removing dashboard css'), chalk.cyan(conf.dashboard.css), chalk.gray('...'))

			await filesystem.replace('resources/views/templates/wrapper.blade.php', `\n    <link rel="stylesheet" href="/extensions/${data.data.id}/_assets/dashboard.style.css?t={{ \\Illuminate\\Support\\Facades\\DB::table('settings')->where('key', 'blueprint::cache')->first()->value }}">`, '')
		}

		if (conf.data?.directory) {
			if (conf.info.flags?.includes('hasRemovalScript') && fs.existsSync(`.blueprint/extensions/${data.data.id}/private/remove.sh`)) {
				const cmd = cp.spawn('bash', [`.blueprint/extensions/${data.data.id}/private/remove.sh`], {
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

		if (conf.requests?.routers?.client) {
			console.log(chalk.gray('Removing client router'), chalk.cyan(`routes/client-${data.data.id}.php`), chalk.gray('...'))

			await Promise.allSettled([
				fs.promises.rm(`routes/client-${data.data.id}.php`),
				filesystem.replace('routes/api-client.php', `include 'client-${data.data.id}.php';`, '')
			])

			console.log(chalk.gray('Removing client router'), chalk.cyan(`routes/client-${data.data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.application) {
			console.log(chalk.gray('Removing application router'), chalk.cyan(`routes/api-application.php`), chalk.gray('...'))

			await Promise.allSettled([
				fs.promises.rm(`routes/application-${data.data.id}.php`),
				filesystem.replace('routes/api-application.php', `include 'application-${data.data.id}.php';`, '')
			])

			console.log(chalk.gray('Removing application router'), chalk.cyan(`routes/api-application.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.routers?.web) {
			console.log(chalk.gray('Removing base router'), chalk.cyan(`routes/base-${data.data.id}.php`), chalk.gray('...'))

			await Promise.allSettled([
				fs.promises.rm(`routes/base-${data.data.id}.php`),
				filesystem.replace('routes/base.php', `include 'base-${data.data.id}.php';`, '')
			])

			console.log(chalk.gray('Removing base router'), chalk.cyan(`routes/base-${data.data.id}.php`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.requests?.controllers) {
			console.log(chalk.gray('Removing controllers'), chalk.cyan(`app/BlueprintFramework/Extensions/${data.data.id}`), chalk.gray('...'))

			if (fs.existsSync(`app/BlueprintFramework/Extensions/${data.data.id}`)) await fs.promises.rm(`app/BlueprintFramework/Extensions/${data.data.id}`, { recursive: true })

			console.log(chalk.gray('Removing controllers'), chalk.cyan(`app/BlueprintFramework/Extensions/${data.data.id}`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		if (conf.database?.migrations && fs.existsSync(`database/migrations-${data.data.id}`) && args.migrate) {
			console.log(chalk.gray('Rolling back migrations'), chalk.cyan(`database/migrations-${data.data.id}`), chalk.gray('...'))

			await system.execute(`php artisan migrate:rollback --force --path=database/migrations-${data.data.id}`, { async: true })
			await fs.promises.rm(`database/migrations-${data.data.id}`, { recursive: true })

			console.log(chalk.gray('Rolling back migrations'), chalk.cyan(`database/migrations-${data.data.id}`), chalk.gray('...'), chalk.bold.green('Done'))
		}

		for (const step of data.data.installation.filter((step) => (step.type as any) === 'dashboard-route').concat(data.data.removal ?? [])) {
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

					console.log(chalk.yellow('Remove dashboard route'), chalk.green(step.path), chalk.yellow('...'))
					console.log(chalk.gray('If you are using a theme you should manually remove the route to prevent automation issues.'))

					const newRoute = [
						'        {',
						`            path: '${step.path}',`,
						`            name: '${step.name}',`,
						`            permission: '${step.permission}',`,
						`            component: ${step.component},`,
						'        },'
					].join('\n')

					let router: string
					if (fs.existsSync('resources/scripts/routers/routes.ts')) router = await fs.promises.readFile('resources/scripts/routers/routes.ts', 'utf-8')
					else router = await fs.promises.readFile('resources/scripts/routers/routes.tsx', 'utf-8')

					const importLine = `import ${step.component} from '${step.componentPath}';`
					if (router.includes(importLine)) {
						const lines = router.split('\n')
						router = lines.filter((line) => !line.includes(importLine)).join('\n')
					}

					if (fs.existsSync('resources/scripts/routers/routes.ts')) await fs.promises.writeFile('resources/scripts/routers/routes.ts', router)
					else await fs.promises.writeFile('resources/scripts/routers/routes.tsx', router)

					console.log(chalk.bold.red('Remove the following route manually in a seperate terminal:'))
					console.log(chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.ts`))
					console.log(chalk.gray('or'), chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.tsx`))
					console.log()
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

		if (args.rebuild) {
			await rebuild({})
		}

		await fs.promises.rm('/tmp/ainx/addon', { recursive: true })
		await system.execute('php artisan optimize', { async: true })

		await fs.promises.rm(`.blueprint/extensions/${args.addon}`, { recursive: true })

		console.log(chalk.gray('Removing Addon'), chalk.cyan(data.data.id), chalk.gray('...'), chalk.bold.green('Done'))
		console.log(chalk.italic.gray(`Took ${Date.now() - start}ms`))

		if (!args.force) await log.ask()
	} catch (err: any) {
		console.error(chalk.red(String(err?.stack ?? err)))
		console.error(chalk.red('Invalid ainx file'))

		if (!args.force) await log.ask()

		process.exit(1)
	}
}