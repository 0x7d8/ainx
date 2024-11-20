import chalk from "chalk"
import fs from "fs"
import remove from "src/commands/remove"
import install from "src/commands/install"
import enquirer from "enquirer"
import { intercept } from "src/globals/log"
import * as ainx from "src/globals/ainx"
import * as blueprint from "src/globals/blueprint"
import { version as pckgVersion } from "../../package.json"
import semver from "semver"
import rebuild from "src/commands/rebuild"
import cp from "child_process"

export type Args = {
	files: string[]
	skipSteps: boolean
	rebuild: boolean
	disableSmoothMode: boolean
	excludeFlags: string[]
	force: boolean
}

export default async function upgrade(args: Args): Promise<number> {
	if (!args.files.length) {
		console.error(chalk.red('No files provided'))
		return 1
	}

	if (args.files.length !== 1) {
		if (!args.force) {
			const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: `Upgrade ${args.files.length} addons?`
			})

			if (!confirm) {
				console.log(chalk.yellow('Cancelled'))
				return 0
			}
		}

		console.log(chalk.gray('Upgrading'), chalk.cyan(args.files.length), chalk.gray('addons ...'))

		for (const file of args.files) {
			await upgrade({ ...args, files: [file], rebuild: false, force: true })
		}

		if (args.rebuild) await rebuild({ disableSmoothMode: args.disableSmoothMode }).catch(() => {
			console.error(chalk.red('Rebuild failed, please rebuild manually after fixing the issue by running:'))
			console.error(chalk.cyan('ainx rebuild'))
		})

		console.log(chalk.gray('Upgrading'), chalk.cyan(args.files.length), chalk.gray('addons ...'), chalk.bold.green('Done'))

		return 0
	}

	const file = args.files[0]

	if (!file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.cyan('.ainx'))
		return 1
	}

	if (!fs.existsSync(`.blueprint/extensions/${file.replace('.ainx', '')}/${file}`)) {
		console.error(chalk.red('Addon is not (properly) installed, install instead'))
		return 1
	}

	if (!fs.existsSync(file)) {
		console.error(chalk.red('File does not exist'))
		return 1
	}

	const [ data, conf, zip ] = ainx.parse(file)
	if (!zip.test()) {
		console.error(chalk.red('Invalid ainx file'))
		return 1
	}

	if (semver.gt(data.ainxRequirement, pckgVersion)) {
		console.error(chalk.red('Ainx version requirement not met'))
		console.log(chalk.gray('Required:'), chalk.cyan(data.ainxRequirement))
		console.log(chalk.gray('Current:'), chalk.cyan(pckgVersion))
		console.log(chalk.gray('Update using:'))
		console.log(chalk.cyan('npm i -g ainx@latest'))

		return 1
	}

	if (!args.force) {
		const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
			type: 'confirm',
			name: 'confirm',
			message: `Upgrade ${conf.info.name}?`
		})

		if (!confirm) {
			console.log(chalk.yellow('Cancelled'))
			return 0
		}
	}

	const start = Date.now(),
		log = intercept()

	console.log()
	console.log(chalk.gray('Upgrading ...'))
	console.log()

	if (conf.data?.directory && fs.existsSync(`.blueprint/extensions/${data.id}/private/update.sh`)) {
		console.log(chalk.gray('Running addon update script ...'))

		const cmd = cp.spawn('bash', [`.blueprint/extensions/${data.id}/private/update.sh`], {
			stdio: 'inherit',
			cwd: process.cwd(),
			env: {
				...process.env,
				...blueprint.environment(conf)
			}
		})

		await new Promise((resolve) => cmd.on('close', resolve))

		console.log(chalk.gray('Running addon update script ...'), chalk.bold.green('Done'))
	} else if (!data.skipRemoveOnUpgrade) {
		await remove({
			addons: [file.replace('.ainx', '')],
			excludeFlags: args.excludeFlags,
			force: true,
			migrate: false,
			rebuild: false,
			skipSteps: args.skipSteps,
			disableSmoothMode: args.disableSmoothMode
		}, true)
	}

	await install({
		files: [file],
		excludeFlags: args.excludeFlags,
		force: true,
		rebuild: args.rebuild,
		skipSteps: args.skipSteps,
		generateFromBlueprint: false,
		disableSmoothMode: args.disableSmoothMode,
		applyPermissions: true
	}, true)

	console.log(chalk.gray('Upgrading ...'), chalk.bold.green('Done'))
	console.log(chalk.italic.gray(`Took ${Date.now() - start}ms`))

	if (!args.force) await log.ask()

	return 0
}