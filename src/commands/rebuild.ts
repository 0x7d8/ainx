import { time } from "@rjweb/utils"
import chalk from "chalk"
import cp from "child_process"
import fs from "fs"
import path from "path"

export type Args = {
	disableSmoothMode: boolean
}

export default async function rebuild(args: Args) {
	const nodeVersion = parseInt(process.version.split('.')[0].slice(1))

	if (nodeVersion < 16) {
		console.error(chalk.red('Node version must be 16 or higher'))
		process.exit(1)
	}

	const installCmd = cp.spawn('yarn', ['install'], {
		stdio: 'inherit',
		cwd: process.cwd()
	})

	await new Promise((resolve) => installCmd.on('close', resolve))

	console.log(chalk.gray('Rebuilding assets ...'))
	console.log()
	console.log(chalk.bold.red('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@'))
	console.log(chalk.bold.red('@  THIS MAY TAKE A WHILE, PLEASE WAIT  @'))
	console.log(chalk.bold.red('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@'))
	console.log()

	const tmpDir = path.join('/tmp', 'ainx', 'assets')
	let files: string[] = []

	if (!args.disableSmoothMode) {
		if (fs.existsSync(tmpDir)) await fs.promises.rm(tmpDir, { recursive: true, force: true })
		await fs.promises.mkdir(tmpDir, { recursive: true })

		files = await fs.promises.readdir(path.join(process.cwd(), 'public', 'assets'))
			.then((files) => files.filter((file) => file.endsWith('.js') || file.endsWith('.map')))

		for (const file of files) {
			await fs.promises.copyFile(path.join(process.cwd(), 'public', 'assets', file), path.join(tmpDir, file))
		}
	}

	try {
		const cmd = cp.spawn('yarn', ['build:production'], {
			detached: true,
			env: {
				...process.env,
				NODE_OPTIONS: '--openssl-legacy-provider'
			}, cwd: process.cwd()
		})

		cmd.stdout?.pipe(process.stdout)
		cmd.stderr?.pipe(process.stderr)

		if (!args.disableSmoothMode) {
			setTimeout(() => {
				for (const file of files) {
					fs.promises.copyFile(path.join(tmpDir, file), path.join(process.cwd(), 'public', 'assets', file))
				}
			}, time(2).s())
		}

		await new Promise<void>((resolve, reject) => {
			cmd.on('exit', (code) => {
				if (code === 0) resolve()
				else reject()
			})

			cmd.on('error', reject)
		})

		if (!args.disableSmoothMode) {
			for (const file of files) {
				await fs.promises.rm(path.join(tmpDir, file))
			}
		}
	} catch {
		const cmd = cp.spawn('yarn', ['build:production'], {
			detached: true,
			cwd: process.cwd()
		})

		cmd.stdout?.pipe(process.stdout)
		cmd.stderr?.pipe(process.stderr)

		if (!args.disableSmoothMode) {
			setTimeout(() => {
				for (const file of files) {
					fs.promises.copyFile(path.join(tmpDir, file), path.join(process.cwd(), 'public', 'assets', file))
				}
			}, time(2).s())
		}

		await new Promise<void>((resolve, reject) => {
			cmd.on('exit', (code) => {
				if (code === 0) resolve()
				else reject()
			})

			cmd.on('error', reject)
		})

		if (!args.disableSmoothMode) {
			for (const file of files) {
				await fs.promises.rm(path.join(tmpDir, file))
			}
		}
	}

	if (!args.disableSmoothMode) {
		await fs.promises.rm(tmpDir, { recursive: true, force: true })
	}

	console.log()
	console.log(chalk.gray('Rebuilding assets ...'), chalk.bold.green('Done'))
}