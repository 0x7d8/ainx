import chalk from "chalk"
import fs from "fs"
import enquirer from "enquirer"
import AdmZip from "adm-zip"
import { manifest } from "src/types/manifest"
import yaml from "js-yaml"
import { filesystem, system } from "@rjweb/utils"
import cp from "child_process"

export type Args = {
	addon: string
	rebuild: boolean
	force: boolean
	migrate: boolean
}

export default async function remove(args: Args, skipRoutes: boolean = false) {
	args.addon = args.addon.replace('.ainx', '')

	console.log(chalk.bold.red('IF THERE ARE ANY ISSUES WITH THIS CLI, PLEASE REPORT THEM IN A'))
	console.log(chalk.bold.red('TICKET ON https://rjansen.dev/discord OR ON GITHUB'))

	if (!fs.existsSync(`.blueprint/extensions/${args.addon}`)) {
		console.error(chalk.red('Addon is not installed'))
		process.exit(1)
	}

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

		console.log(chalk.green('Removing'), data.data.id, chalk.yellow('...'))
		const bpZip = new AdmZip(zip.readFile('addon.blueprint') ?? undefined)

		bpZip.extractAllTo('/tmp/ainx/addon', true)
		const conf = yaml.load(bpZip.readAsText('conf.yml')) as {
			info: {
				name: string
				version: string
			}

			requests?: {
				controllers?: string
				routers?: {
					client?: string
				}
			}

			data?: {
				directory?: string
			}

			database?: {
				migrations?: string
			}
		}

		console.log(chalk.gray('Addon Name:'), chalk.green(conf.info.name))
		console.log(chalk.gray('Addon Version:'), chalk.green(conf.info.version))

		if (conf.data?.directory) {
			if (fs.existsSync(`.blueprint/extensions/${data.data.id}/private/remove.sh`)) {
				const cmd = cp.spawn('bash', [`.blueprint/extensions/${data.data.id}/private/remove.sh`], {
					stdio: 'inherit',
					cwd: process.cwd(),
					env: {
						...process.env,
						EXTENSION_IDENTIFIER: data.data.id,
						PTERODACTYL_DIRECTORY: process.cwd()
					}
				})

				await new Promise((resolve) => cmd.on('close', resolve))
			}
		}

		if (conf.requests?.routers?.client) {
			await Promise.allSettled([
				fs.promises.rm(`routes/client-${data.data.id}.php`),
				filesystem.replace('routes/api-client.php', `include 'client-${data.data.id}.php';`, '')
			])
		}

		if (conf.requests?.controllers) {
			if (fs.existsSync(`app/BlueprintFramework/Extensions/${data.data.id}`)) await fs.promises.rm(`app/BlueprintFramework/Extensions/${data.data.id}`, { recursive: true })
		}

		if (conf.database?.migrations && fs.existsSync(`database/migrations-${data.data.id}`) && args.migrate) {
			await system.execute(`php artisan migrate:rollback --force --path=database/migrations-${data.data.id}`, { async: true })
			await fs.promises.rm(`database/migrations-${data.data.id}`, { recursive: true })
		}

		for (const step of data.data.installation.filter((step) => step.type === 'dashboard-route').concat(data.data.removal ?? [])) {
			switch (step.type) {
				case "copy": {
					if (!fs.existsSync(step.destination)) await fs.promises.mkdir(step.destination, { recursive: true })

					await fs.promises.cp(step.source, step.destination, { recursive: true })
					break
				}

				case "remove": {
					try {
						await fs.promises.rm(step.path, { recursive: true })
					} catch { }

					break
				}

				case "replace": {
					const content = await fs.promises.readFile(step.file, 'utf-8'),
						replaceContent = step.newline ? `${step.replace}\n` : step.replace

					if (step.unique && content.includes(step.replace)) break

					const replaced = step.global
						? content.replaceAll(step.search, replaceContent)
						: content.replace(step.search, replaceContent)

					await fs.promises.writeFile(step.file, replaced)
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

					console.log(chalk.yellow('Remove the following route manually in a seperate terminal:'))
					console.log(chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.ts`))
					console.log(chalk.gray('or'), chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.tsx`))
					console.log('')
					console.log(chalk.gray(newRoute))
					console.log('')

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
			console.log(chalk.gray('Rebuilding assets... (this may take a while)'))
			const cmd = cp.spawn('yarn', ['build:production'], {
				env: {
					...process.env,
					NODE_OPTIONS: '--openssl-legacy-provider'
				}, stdio: 'inherit',
				cwd: process.cwd()
			})

			await new Promise((resolve) => cmd.on('close', resolve))
			await Promise.allSettled([
				system.execute('php artisan route:clear', { async: true }),
				system.execute('php artisan route:cache', { async: true }),
				system.execute('php artisan config:clear', { async: true }),
				system.execute('php artisan config:cache', { async: true }),
				system.execute('php artisan view:clear', { async: true }),
				system.execute('php artisan view:cache', { async: true })
			])
		}

		await fs.promises.rm('/tmp/ainx/addon', { recursive: true })
		await fs.promises.rm(`.blueprint/extensions/${args.addon}`, { recursive: true })

		console.log(chalk.green('Addon Removed'))
	} catch (err: any) {
		console.error(chalk.red(String(err?.stack ?? err)))
		console.error(chalk.red('Invalid ainx file'))
		process.exit(1)
	}
}