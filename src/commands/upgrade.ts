import chalk from "chalk"
import fs from "fs"
import remove from "src/commands/remove"
import install from "src/commands/install"
import enquirer from "enquirer"
import { intercept } from "src/globals/log"
import * as ainx from "src/globals/ainx"
import { version as pckgVersion } from "../../package.json"
import semver from "semver"
import rebuild from "src/commands/rebuild"

export type Args = {
	files: string[]
	skipSteps: boolean
	rebuild: boolean
	disableSmoothMode: boolean
}

export default async function upgrade(args: Args, force: boolean = false) {
	if (!args.files.length) {
		console.error(chalk.red('No files provided'))
		process.exit(1)
	}

	if (args.files.length !== 1) {
		const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
			type: 'confirm',
			name: 'confirm',
			message: `Upgrade ${args.files.length} addons?`
		})

		if (!confirm) {
			console.log(chalk.yellow('Cancelled'))
			process.exit(0)
		}

		console.log(chalk.gray('Upgrading'), chalk.cyan(args.files.length), chalk.gray('addons ...'))

		for (const file of args.files) {
			await upgrade({ ...args, files: [file], rebuild: false }, true)
		}

		if (args.rebuild) await rebuild({ disableSmoothMode: args.disableSmoothMode })

		console.log(chalk.gray('Upgrading'), chalk.cyan(args.files.length), chalk.gray('addons ...'), chalk.bold.green('Done'))

		return
	}

	const file = args.files[0]

	if (!file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.cyan('.ainx'))
		process.exit(1)
	}

	if (!fs.existsSync(`.blueprint/extensions/${file.replace('.ainx', '')}/${file}`)) {
		console.error(chalk.red('Addon is not (properly) installed, install instead'))
		process.exit(1)
	}

	if (!fs.existsSync(file)) {
		console.error(chalk.red('File does not exist'))
		process.exit(1)
	}

	const [ data, conf, zip ] = ainx.parse(file)
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

	if (!force) {
		const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
			type: 'confirm',
			name: 'confirm',
			message: `Upgrade ${conf.info.name}?`
		})

		if (!confirm) {
			console.log(chalk.yellow('Cancelled'))
			process.exit(0)
		}
	}

	const start = Date.now(),
		log = intercept()

	console.log()
	console.log(chalk.gray('Upgrading ...'))
	console.log()

	await remove({
		addons: [file.replace('.ainx', '')],
		force: true,
		migrate: false,
		rebuild: false,
		skipSteps: args.skipSteps,
		disableSmoothMode: args.disableSmoothMode
	}, true)

	await install({
		files: [file],
		force: true,
		rebuild: args.rebuild,
		skipSteps: args.skipSteps,
		generateFromBlueprint: false,
		disableSmoothMode: args.disableSmoothMode
	}, true)

	console.log(chalk.gray('Upgrading ...'), chalk.bold.green('Done'))
	console.log(chalk.italic.gray(`Took ${Date.now() - start}ms`))

	if (!force) await log.ask()
}