import chalk from "chalk"
import fs from "fs"
import AdmZip from "adm-zip"
import enquirer from "enquirer"
import { filesystem, system } from "@rjweb/utils"
import cp from "child_process"
import path from "path"
import os from "os"

export type Args = {}

export default async function backupCreate(args: Args): Promise<number> {
	const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
		type: 'confirm',
		name: 'confirm',
		message: 'Create a panel backup? You can restore this backup using `ainx backup restore`'
	})

	if (!confirm) {
		console.log(chalk.yellow('Cancelled'))
		return 0
	}

	const { database } = await enquirer.prompt<{ database: boolean }>({
		type: 'confirm',
		name: 'database',
		message: 'Include database in backup?'
	})

	if (database) {
		console.log(chalk.gray('Creating database backup ...'))

		const env = await filesystem.env('.env').catch(() => null)
		if (!env) {
			console.error(chalk.red('No .env file found, cannot backup database!'))
			return 1
		}

		const mysqlDump = system.execute('which mysqldump')
		if (!mysqlDump) {
			console.error(chalk.red('mysqldump not found, cannot backup database!'))
			return 1
		}

		const host = env.DB_HOST ?? env.DATABASE_HOST ?? 'localhost',
			port = parseInt(env.DB_PORT ?? env.DATABASE_PORT ?? '3306'),
			database = env.DB_DATABASE ?? env.DATABASE_DATABASE,
			username = env.DB_USERNAME ?? env.DATABASE_USERNAME,
			password = env.DB_PASSWORD ?? env.DATABASE_PASSWORD

		const mysqlDumpRes = cp.spawn('mysqldump', ['-u', username, '-p' + password, '-h', host, '-P', port.toString(), database], {
			stdio: 'pipe'
		})

		await fs.promises.mkdir(path.join(os.tmpdir(), 'ainx'), { recursive: true }).catch(() => null)

		const file = fs.createWriteStream(path.join(os.tmpdir(), 'ainx', 'database.sql'))
		mysqlDumpRes.stdout?.pipe(file)

		await new Promise((resolve) => mysqlDumpRes.on('close', resolve))

		console.log(chalk.gray('Creating database backup ...'), chalk.bold.green('Done'))
	}

	console.log(chalk.gray('Creating panel backup ...'))

	const name = `backup-${Date.now()}.zip`,
		zip = new AdmZip()

	await fs.promises.mkdir('.backups').catch(() => null)

	if (database) {
		zip.addLocalFile(path.join(os.tmpdir(), 'ainx', 'database.sql'), undefined, 'database.sql')
	}

	zip.addLocalFolder('.', undefined, (file) => file.startsWith('resources') || file.startsWith('app') || (file.startsWith('public/assets') && !file.includes('extension')) || file.startsWith('routes'))
	await zip.writeZipPromise(`.backups/${name}`)

	if (database) {
		await fs.promises.rm(path.join(os.tmpdir(), 'ainx', 'database.sql'))
	}

	console.log(chalk.gray('Creating panel backup ...'), chalk.bold.green('Done'))

	return 0
}