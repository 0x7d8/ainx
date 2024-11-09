import chalk from "chalk"
import fs from "fs"
import AdmZip from "adm-zip"
import enquirer from "enquirer"
import { filesystem } from "@rjweb/utils"
import cp from "child_process"

export type Args = {}

export default async function backupRestore(args: Args): Promise<number> {
	const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
		type: 'confirm',
		name: 'confirm',
		message: 'Restore a panel backup?'
	})

	if (!confirm) {
		console.log(chalk.yellow('Cancelled'))
		return 1
	}

	const backups = await fs.promises.readdir('.backups').catch(() => [])
		.then((backups) => backups.filter((backup) => backup.endsWith('.zip')))
		.then((backups) => backups.map((backup) => new Date(parseInt(backup.replace('backup-', '')))))
		.then((backups) => backups.sort((a, b) => b.getTime() - a.getTime()))

	if (!backups.length) {
		console.error(chalk.red('No backups found'))
		return 1
	}

	const { backup } = await enquirer.prompt<{ backup: Date }>({
		type: 'select',
		name: 'backup',
		message: 'Select a backup to restore',
		choices: backups.map((backup) => ({
			message: backup.toLocaleString(),
			name: backup as any,
			value: backup
		}))
	})

	console.log(chalk.gray('Restoring'), chalk.cyan(backup.toLocaleString()), chalk.gray('...'))

	const zip = new AdmZip(`.backups/backup-${backup.getTime()}.zip`)

	if (zip.getEntry('database.sql')) {
		const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
			type: 'confirm',
			name: 'confirm',
			message: 'Restore database?'
		})

		if (confirm) {
			console.log(chalk.gray('Restoring database ...'))

			const env = await filesystem.env('.env').catch(() => null)

			if (!env) {
				console.error(chalk.red('No .env file found, cannot restore database!'))
				return 1
			}

			const mysql = cp.spawn('mysql', ['-u', env.DB_USERNAME, '-p' + env.DB_PASSWORD, env.DB_DATABASE], {
				stdio: 'pipe'
			})

			const file = zip.readFile('database.sql')
			mysql.stdin?.write(file)
			mysql.stdin?.end()

			await new Promise((resolve) => mysql.on('close', resolve))

			console.log(chalk.gray('Restoring database ...'), chalk.bold.green('Done'))
		}
	}

	console.log(chalk.gray('Removing files ...'))

	await Promise.allSettled([
		fs.promises.rm('resources', { recursive: true, force: true }),
		fs.promises.rm('app', { recursive: true, force: true }),
		fs.promises.rm('public/assets', { recursive: true, force: true }),
		fs.promises.rm('routes', { recursive: true, force: true })
	])

	console.log(chalk.gray('Removing files ...'), chalk.bold.green('Done'))

	console.log(chalk.gray('Extracting'), chalk.cyan(backup.toLocaleString()), chalk.gray('...'))

	zip.extractAllTo('.', true)

	console.log(chalk.gray('Extracting'), chalk.cyan(backup.toLocaleString()), chalk.gray('...'), chalk.bold.green('Done'))

	console.log(chalk.gray('Restoring'), chalk.cyan(backup.toLocaleString()), chalk.gray('...'), chalk.bold.green('Done'))

	return 0
}