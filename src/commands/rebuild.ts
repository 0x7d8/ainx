import chalk from "chalk"
import cp from "child_process"

export type Args = {}

export default async function rebuild(args: Args) {
	const nodeVersion = parseInt(process.version.split('.')[0].slice(1))

	if (nodeVersion < 16) {
		console.error(chalk.red('Node version must be 16 or higher'))
		process.exit(1)
	}

	const installCmd = cp.spawn('yarn', ['install'], {
		env: {
			...process.env,
			NODE_OPTIONS: '--openssl-legacy-provider'
		}, stdio: 'inherit',
		cwd: process.cwd()
	})

	await new Promise((resolve) => installCmd.on('close', resolve))

	console.log(chalk.gray('Rebuilding assets... (this may take a while)'))
	const cmd = cp.spawn('yarn', ['build:production'], {
		env: {
			...process.env,
			NODE_OPTIONS: nodeVersion > 16 ? '--openssl-legacy-provider' : ''
		}, stdio: 'inherit',
		cwd: process.cwd()
	})

	await new Promise((resolve) => cmd.on('close', resolve))

	console.log(chalk.green('Rebuild complete'))
}