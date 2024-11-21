import chalk from "chalk"
import fs from "fs"
import AdmZip from "adm-zip"
import enquirer from "enquirer"
import { filesystem, system } from "@rjweb/utils"
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

			const mysql = system.execute('which mysql')
			if (!mysql) {
				console.error(chalk.red('mysql not found, cannot backup database!'))
				return 1
			}
	
			const host = env.DB_HOST ?? env.DATABASE_HOST ?? 'localhost',
				port = parseInt(env.DB_PORT ?? env.DATABASE_PORT ?? '3306'),
				database = env.DB_DATABASE ?? env.DATABASE_DATABASE,
				username = env.DB_USERNAME ?? env.DATABASE_USERNAME,
				password = env.DB_PASSWORD ?? env.DATABASE_PASSWORD	

			const mysqlRes = cp.spawn('mysql', ['-u', username, '-p' + password, '-h', host, '-P', port.toString(), database], {
				stdio: 'pipe'
			})

			const file = zip.readFile('database.sql')
			mysqlRes.stdin?.write(file)
			mysqlRes.stdin?.end()

			await new Promise((resolve) => mysqlRes.on('close', resolve))

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