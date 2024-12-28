import chalk from "chalk"
import fs from "fs"
import enquirer from "enquirer"
import axios from "axios"

export type Args = {}

export default async function logs(args: Args): Promise<number> {
	const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
		type: 'confirm',
		name: 'confirm',
		message: 'Upload a panel log?'
	})

	if (!confirm) {
		console.log(chalk.yellow('Cancelled'))
		return 1
	}

	const logs = await fs.promises.readdir('storage/logs').catch(() => [])
		.then((logs) => logs.filter((log) => log.startsWith('laravel-')))
		.then((logs) => logs.map((log) => new Date(log.replace('laravel-', '').replace('.log', ''))))
		.then((logs) => logs.sort((a, b) => b.getTime() - a.getTime()))

	if (!logs.length) {
		console.error(chalk.red('No logs found'))
		return 1
	}

	const { log } = await enquirer.prompt<{ log: Date }>({
		type: 'select',
		name: 'log',
		message: 'Select a log to upload',
		choices: logs.map((log) => ({
			message: log.toLocaleString().split(',')[0],
			name: log as any,
			value: log
		}))
	})

	console.log(chalk.gray('Uploading Log'), chalk.cyan(log.toLocaleString().split(',')[0]), chalk.gray('...'))

	const logFile = await fs.promises.readFile(`storage/logs/laravel-${log.toISOString().split('T')[0]}.log`, 'utf-8')

	const { data } = await axios.post<{
		key: string
	}>('https://api.pastes.dev/post', logFile, {
		headers: {
			'Content-Type': 'text/plain'
		}
	})

	console.log(chalk.gray('Uploading Log'), chalk.cyan(log.toLocaleString().split(',')[0]), chalk.gray('...'), chalk.bold.green('Done'))
	console.log()
	console.log(chalk.underline.blue(`https://pastes.dev/${data.key}`))

	return 0
}