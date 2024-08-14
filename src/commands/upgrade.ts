import chalk from "chalk"
import fs from "fs"
import remove from "src/commands/remove"
import install from "src/commands/install"
import enquirer from "enquirer"

export type Args = {
	file: string
}

export default async function upgrade(args: Args) {
	if (!args.file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.green('.ainx'))
		process.exit(1)
	}

	if (!fs.existsSync(`.blueprint/extensions/${args.file.replace('.ainx', '')}/${args.file}`)) {
		console.error(chalk.red('Addon is not (properly) installed, install instead'))
		process.exit(1)
	}

	const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
		type: 'confirm',
		name: 'confirm',
		message: `Upgrade ${args.file.replace('.ainx', '')}?`
	})

	if (!confirm) {
		console.log(chalk.yellow('Cancelled'))
		process.exit(0)
	}

	await remove({
		addon: args.file.replace('.ainx', ''),
		force: true,
		migrate: false,
		rebuild: false
	}, true)

	await install({
		file: args.file,
		force: true
	}, true)

	console.log(chalk.green('Upgrade complete'))
}