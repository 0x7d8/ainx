import axios from "axios"
import chalk from "chalk"
import enquirer from "enquirer"

class Log {
	public data = ''
	public originalStdout = process.stdout._write
	public originalStderr = process.stderr._write

	constructor() {
		const self = this

		process.stdout._write = function (this, chunk, ...args) {
			self.data += chunk
			return self.originalStdout.call(this, chunk, ...args)
		}

		process.stderr._write = function (this, chunk, ...args) {
			self.data += chunk
			return self.originalStderr.call(this, chunk, ...args)
		}
	}

	public async ask() {
		process.stdout._write = this.originalStdout
		process.stderr._write = this.originalStderr

		console.log()

		const { logs } = await enquirer.prompt<{ logs: boolean }>({
			type: 'confirm',
			name: 'logs',
			message: 'Upload the output of this command for debugging?'
		})

		if (!logs) return

		console.log(chalk.gray('Uploading Logs ...'))

		const ansiStripped = this.data.replace(/\u001b\[[0-9;]*m/g, '')

		const { data } = await axios.post<{
			key: string
		}>('https://api.pastes.dev/post', ansiStripped, {
			headers: {
				'Content-Type': 'text/yaml'
			}
		})

		console.log(chalk.gray('Uploading Logs ...'), chalk.bold.green('Done'))
		console.log()
		console.log(chalk.underline.blue(`https://pastes.dev/${data.key}`))
	}
}

export function intercept() {
	return new Log()
}