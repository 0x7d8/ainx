import chalk from "chalk"
import fs from "fs"
import * as ainx from "src/globals/ainx"

export type Args = {
	file: string
}

export default async function inspect(args: Args) {
	if (!args.file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.cyan('.ainx'))
		process.exit(1)
	}

	if (!fs.existsSync(args.file)) {
		console.error(chalk.red('File does not exist'))
		process.exit(1)
	}

	const [ data, conf, zip ] = ainx.parse(args.file)
	if (!zip.test()) {
		console.error(chalk.red('Invalid ainx file'))
		process.exit(1)
	}

	const seperator = '       ',
		stat = await fs.promises.stat(args.file)

	if (data.ainxRequirement) console.log(seperator, chalk.gray('Requirement:'), chalk.cyan(`ainx@${data.ainxRequirement}`))
	console.log(seperator, chalk.gray('Identifier: '), chalk.cyan(conf.info.identifier))
	console.log(seperator, chalk.gray('Name:       '), chalk.cyan(conf.info.name))
	console.log(seperator, chalk.gray('Version:    '), chalk.cyan(conf.info.version))

	console.log()

	console.log(seperator, chalk.gray('Description:'), chalk.cyan(conf.info.description))
	if (conf.info.flags?.length) console.log(seperator, chalk.gray('Flags:      '), chalk.cyan(conf.info.flags?.join(', ')))
	console.log(seperator, chalk.gray('Size:       '), chalk.cyan(`${(stat.size / 1024).toFixed(2)} KB`))
	console.log(seperator, chalk.gray('Author:     '), chalk.cyan(conf.info.author))
}