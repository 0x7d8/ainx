import chalk from "chalk"
import fs from "fs"
import AdmZip from "adm-zip"
import enquirer from "enquirer"

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

	const zip = new AdmZip(`.backups/backup-${backup.getTime()}.zip`),
		files = await fs.promises.readdir('.').then((files) => files.filter((file) => (!file.startsWith('.') || file === '.blueprint') && file !== 'node_modules'))

	console.log(chalk.gray('Removing'), chalk.cyan(files.length), chalk.gray('files ...'))

	for (const file of files) {
		await fs.promises.rm(file, { recursive: true, force: true })
	}

	console.log(chalk.gray('Removing'), chalk.cyan(files.length), chalk.gray('files ...'), chalk.bold.green('Done'))

	console.log(chalk.gray('Extracting'), chalk.cyan(backup.toLocaleString()), chalk.gray('...'))

	zip.extractAllTo('.', true)

	console.log(chalk.gray('Extracting'), chalk.cyan(backup.toLocaleString()), chalk.gray('...'), chalk.bold.green('Done'))

	console.log(chalk.gray('Restoring'), chalk.cyan(backup.toLocaleString()), chalk.gray('...'), chalk.bold.green('Done'))

	return 0
}