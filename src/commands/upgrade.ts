import chalk from "chalk"
import fs from "fs"
import remove from "src/commands/remove"
import install from "src/commands/install"
import enquirer from "enquirer"
import { intercept } from "src/globals/log"
import * as ainx from "src/globals/ainx"
import { version as pckgVersion } from "../../package.json"
import semver from "semver"

export type Args = {
	file: string
	skipSteps: boolean
	rebuild: boolean
	disableSmoothMode: boolean
}

export default async function upgrade(args: Args) {
	if (!args.file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.cyan('.ainx'))
		process.exit(1)
	}

	if (!fs.existsSync(`.blueprint/extensions/${args.file.replace('.ainx', '')}/${args.file}`)) {
		console.error(chalk.red('Addon is not (properly) installed, install instead'))
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

	if (semver.gt(data.ainxRequirement, pckgVersion)) {
		console.error(chalk.red('Ainx version requirement not met'))
		console.log(chalk.gray('Required:'), chalk.cyan(data.ainxRequirement))
		console.log(chalk.gray('Current:'), chalk.cyan(pckgVersion))
		console.log(chalk.gray('Update using:'))
		console.log(chalk.cyan('npm i -g ainx@latest'))

		process.exit(1)
	}

	const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
		type: 'confirm',
		name: 'confirm',
		message: `Upgrade ${conf.info.name}?`
	})

	const start = Date.now(),
		log = intercept()

	console.log()
	console.log(chalk.gray('Upgrading ...'))
	console.log()

	if (!confirm) {
		console.log(chalk.yellow('Cancelled'))
		process.exit(0)
	}

	await remove({
		addon: args.file.replace('.ainx', ''),
		force: true,
		migrate: false,
		rebuild: false,
		skipSteps: args.skipSteps,
		disableSmoothMode: args.disableSmoothMode
	}, true)

	await install({
		file: args.file,
		force: true,
		rebuild: args.rebuild,
		skipSteps: args.skipSteps,
		generateFromBlueprint: false,
		disableSmoothMode: args.disableSmoothMode
	}, true)

	console.log(chalk.gray('Upgrading ...'), chalk.bold.green('Done'))
	console.log(chalk.italic.gray(`Took ${Date.now() - start}ms`))

	await log.ask()
}