import chalk from "chalk"
import fs from "fs"
import enquirer from "enquirer"
import AdmZip from "adm-zip"
import { manifest } from "src/types/manifest"
import yaml from "js-yaml"
import path from "path"
import { system } from "@rjweb/utils"
import cp from "child_process"

export type Args = {
	file: string
	force: boolean
}

export default async function install(args: Args, skipRoutes: boolean = false) {
	console.log(chalk.bold.red('IF THERE ARE ANY ISSUES WITH THIS CLI, PLEASE REPORT THEM IN A'))
	console.log(chalk.bold.red('TICKET ON https://rjansen.dev/discord OR ON GITHUB'))

	if (!args.file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.green('.ainx'))
		process.exit(1)
	}

	if (!fs.existsSync(args.file)) {
		console.error(chalk.red('File does not exist'))
		process.exit(1)
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

		if (fs.existsSync(`.blueprint/extensions/${data.data.id}`) && !args.force) {
			console.error(chalk.red('Addon already installed, update instead'))
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

		console.log(chalk.green('Installing'), data.data.id, chalk.yellow('...'))
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

		if (conf.data?.directory && !fs.existsSync(`.blueprint/extensions/${data.data.id}`)) {
			await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}`, { recursive: true })
			await fs.promises.cp(path.join('/tmp/ainx/addon', conf.data.directory), `.blueprint/extensions/${data.data.id}/private`, { recursive: true })

			if (fs.existsSync(`.blueprint/extensions/${data.data.id}/private/install.sh`)) {
				const cmd = cp.spawn('bash', [`.blueprint/extensions/${data.data.id}/private/install.sh`], {
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

		if (conf.requests?.routers?.client && !fs.existsSync(`routes/client-${data.data.id}.php`)) {
			await fs.promises.appendFile('routes/api-client.php', `\ninclude 'client-${data.data.id}.php';`)

			const client = bpZip.readAsText(conf.requests.routers.client)
				.replace('\'prefix\' => \'', `'prefix' => '/extensions/${data.data.id}`)

			await fs.promises.writeFile(`routes/client-${data.data.id}.php`, client)
		}

		if (conf.requests?.controllers && !fs.existsSync(`app/BlueprintFramework/Extensions/${data.data.id}`)) {
			if (fs.existsSync(`app/BlueprintFramework/Extensions/${data.data.id}`)) await fs.promises.rm(`app/BlueprintFramework/Extensions/${data.data.id}`, { recursive: true })

			await fs.promises.mkdir(`app/BlueprintFramework/Extensions/${data.data.id}`, { recursive: true })

			const controllers = await fs.promises.readdir(path.join('/tmp/ainx/addon', conf.requests.controllers))
			for (const controller of controllers) {
				const content = await fs.promises.readFile(path.join('/tmp/ainx/addon', conf.requests.controllers, controller))
				await fs.promises.writeFile(`app/BlueprintFramework/Extensions/${data.data.id}/${controller}`, content)
			}
		}

		if (conf.database?.migrations && !fs.existsSync(`database/migrations-${data.data.id}`)) {
			await fs.promises.mkdir(`database/migrations-${data.data.id}`, { recursive: true })

			const migrations = await fs.promises.readdir(path.join('/tmp/ainx/addon', conf.database.migrations))
			for (const migration of migrations) {
				const content = await fs.promises.readFile(path.join('/tmp/ainx/addon', conf.database.migrations, migration))

				await fs.promises.writeFile(`database/migrations-${data.data.id}/${migration}`, content)
			}
		}

		for (const step of data.data.installation) {
			switch (step.type) {
				case "copy": {
					if (fs.statSync(step.source).isDirectory()) {
						if (!fs.existsSync(step.destination)) await fs.promises.mkdir(step.destination, { recursive: true })

						await fs.promises.cp(step.source, step.destination, { recursive: true })
					} else {
						await fs.promises.mkdir(path.dirname(step.destination), { recursive: true })
						await fs.promises.cp(step.source, step.destination)
					}

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

					if (step.unique && !step.matches && content.includes(step.replace)) break
					else if (step.unique && step.matches && step.matches.some((match) => content.includes(match))) break

					const replaced = step.global
						? content.replaceAll(step.search, replaceContent)
						: content.replace(step.search, replaceContent)

					await fs.promises.writeFile(step.file, replaced)
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

					console.log(chalk.yellow('Add the following route manually in a seperate terminal:'))
					console.log(chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.ts`))
					console.log(chalk.gray('or'), chalk.cyan(`${process.cwd()}/resources/scripts/routers/routes.tsx`))
					console.log('')
					console.log(chalk.gray(newRoute))
					console.log('')
					console.log(chalk.yellow('After:'))
					console.log('')
					console.log(chalk.gray(afterRoute))

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

		const installCmd = cp.spawn('yarn', ['install'], {
			env: {
				...process.env,
				NODE_OPTIONS: '--openssl-legacy-provider'
			}, stdio: 'inherit',
			cwd: process.cwd()
		})

		await new Promise((resolve) => installCmd.on('close', resolve))

		if (conf.database?.migrations) await system.execute(`php artisan migrate --force --path=database/migrations-${data.data.id}`, { async: true })

		console.log(chalk.gray('Rebuilding assets... (this may take a while)'))
		const cmd = cp.spawn('yarn', ['build:production'], {
			env: {
				...process.env,
				NODE_OPTIONS: '--openssl-legacy-provider'
			}, stdio: 'pipe',
			cwd: process.cwd()
		})

		cmd.stdout.pipe(process.stdout)
		cmd.stderr.pipe(process.stderr)
		process.stdin.pipe(cmd.stdin)

		await new Promise((resolve) => cmd.on('close', resolve))
		await fs.promises.rm('/tmp/ainx/addon', { recursive: true })

		await system.execute('php artisan optimize', { async: true })

		if (!fs.existsSync(`.blueprint/extensions/${data.data.id}`)) await fs.promises.mkdir(`.blueprint/extensions/${data.data.id}`, { recursive: true })
		await fs.promises.cp(args.file, `.blueprint/extensions/${data.data.id}/${data.data.id}.ainx`)

		console.log(chalk.green('Addon Installed'))
	} catch (err: any) {
		console.error(chalk.red(String(err?.stack ?? err)))
		console.error(chalk.red('Invalid ainx file'))
		process.exit(1)
	}
}