import chalk from "chalk"
import fs from "fs"
import AdmZip from "adm-zip"
import enquirer from "enquirer"

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

	console.log(chalk.gray('Creating panel backup ...'))

	const name = `backup-${Date.now()}.zip`,
		zip = new AdmZip()

	await fs.promises.mkdir('.backups').catch(() => null)

	zip.addLocalFolder('.', undefined, (file) => file.startsWith('resources') || file.startsWith('app') || (file.startsWith('public/assets') && !file.includes('extension')) || file.startsWith('routes'))
	await zip.writeZipPromise(`.backups/${name}`)

	console.log(chalk.gray('Creating panel backup ...'), chalk.bold.green('Done'))

	return 0
}