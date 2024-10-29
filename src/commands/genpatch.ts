import chalk from "chalk"
import fs from "fs"
import os from "os"
import remove from "src/commands/remove"
import install from "src/commands/install"
import enquirer from "enquirer"
import { intercept } from "src/globals/log"
import * as ainx from "src/globals/ainx"
import * as blueprint from "src/globals/blueprint"
import { version as pckgVersion } from "../../package.json"
import semver from "semver"
import { network } from "@rjweb/utils"
import path from "path"
import AdmZip from "adm-zip"
import * as tar from "tar"
import simpleGit from "simple-git"

export type Args = {
	old?: string
	file: string
	skipSteps: boolean
	skipRoutes: boolean
	remote: string
	includeCompat: boolean
	outfile?: string
}

export default async function genpatch(args: Args, force = false): Promise<number> {
	const file = args.file

	if (!file.endsWith('.ainx')) {
		console.error(chalk.red('Invalid file type, file must end in'), chalk.cyan('.ainx'))
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

	if (args.old) {
		if (!args.old.endsWith('.ainx')) {
			console.error(chalk.red('Invalid file type, file must end in'), chalk.cyan('.ainx'))
			return 1
		}

		if (!fs.existsSync(args.old)) {
			console.error(chalk.red('File does not exist'))
			return 1
		}

		const [ oldData, _, oldZip ] = ainx.parse(args.old)
		if (!oldZip.test()) {
			console.error(chalk.red('Invalid ainx file'))
			return 1
		}

		if (semver.gt(oldData.ainxRequirement, pckgVersion)) {
			console.error(chalk.red('Ainx version requirement not met'))
			console.log(chalk.gray('Required:'), chalk.cyan(oldData.ainxRequirement))
			console.log(chalk.gray('Current:'), chalk.cyan(pckgVersion))
			console.log(chalk.gray('Update using:'))
			console.log(chalk.cyan('npm i -g ainx@latest'))

			return 1
		}
	}

	if (!force) {
		const { confirm } = await enquirer.prompt<{ confirm: boolean }>({
			type: 'confirm',
			name: 'confirm',
			message: `Generate Patch for ${conf.info.name}?`
		})

		if (!confirm) {
			console.log(chalk.yellow('Cancelled'))
			return 0
		}
	}

	const start = Date.now(),
		log = intercept()

	console.log()
	console.log(chalk.gray('Generating Patch ...'))
	console.log()

	const dir = process.cwd(),
		tmpDir = path.join(os.tmpdir(), 'ainx', 'patch')

	try {
		if (fs.existsSync(tmpDir)) await fs.promises.rm(tmpDir, { recursive: true, force: true })
		await fs.promises.mkdir(tmpDir, { recursive: true })

		console.log(chalk.gray('Copying Remote ...'))

		if (fs.existsSync(args.remote) && fs.lstatSync(args.remote).isDirectory()) {
			await fs.promises.cp(args.remote, tmpDir, { recursive: true })
		} else if (args.remote.endsWith('.tar.gz') || args.remote.endsWith('.zip')) {
			await network.download(args.remote, path.join(tmpDir, path.basename(args.remote)))

			if (args.remote.endsWith('.zip')) {
				const zip = new AdmZip(path.join(tmpDir, path.basename(args.remote)))

				zip.extractAllTo(tmpDir, true)
			} else {
				await tar.extract({
					file: path.join(tmpDir, path.basename(args.remote)),
					keepExisting: false,
					cwd: tmpDir
				})
			}
		}

		if (fs.existsSync(path.join(tmpDir, '.git'))) await fs.promises.rm(path.join(tmpDir, '.git'), { recursive: true, force: true })

		console.log(chalk.gray('Copying Remote ...'), chalk.bold.green('Done'))

		process.chdir(tmpDir)

		const git = simpleGit(tmpDir)
		await git.init()

		await git.addConfig('user.email', 'ainx@ainx.dev')
		await git.addConfig('user.name', 'ainx')

		if (!args.includeCompat) {
			await blueprint.insertCompatFiles()
		}

		await git.add('.')
		await git.commit('Base')

		if (args.old) {
			console.log(chalk.gray('Installing Old Addon ...'))

			await fs.promises.copyFile(path.join(dir, args.old), path.join(tmpDir, args.old))
			await install({ files: [args.old], force: true, rebuild: false, skipSteps: args.skipSteps, disableSmoothMode: true, generateFromBlueprint: false, applyPermissions: false }, args.skipRoutes)
			await fs.promises.rm(path.join(tmpDir, args.old), { force: true })

			await git.add('.')
			await git.commit('Old Addon')

			console.log(chalk.gray('Installing Old Addon ...'), chalk.bold.green('Done'))
		}

		console.log(chalk.gray('Installing Addon ...'))

		await fs.promises.copyFile(path.join(dir, file), path.join(tmpDir, file))
		await remove({ addons: [data.id], force: true, skipSteps: true, disableSmoothMode: true, migrate: false, rebuild: false }, true)
		await install({ files: [file], force: true, rebuild: false, skipSteps: args.skipSteps, disableSmoothMode: true, generateFromBlueprint: false, applyPermissions: false }, Boolean(args.old) || args.skipRoutes)
		await fs.promises.rm(path.join(tmpDir, file), { force: true })

		console.log(chalk.gray('Installing Addon ...'), chalk.bold.green('Done'))
		
		console.log(chalk.gray('Generating Patch ...'))

		await git.add('.')
		const diff = await git.diff(['--staged', '--binary'])
		await fs.promises.writeFile(path.join(dir, args.outfile || `${data.id}.patch`), diff)

		console.log(chalk.gray('Generating Patch ...'), chalk.bold.green('Done'))
		console.log(chalk.italic.gray(`Took ${Date.now() - start}ms`))
	} catch (err: any) {
		console.error(chalk.red(String(err?.stack ?? err)))
		console.error(chalk.red('Addon genpatch failed!!!'))
		console.error(chalk.red('Please check the error message above for more information'))
		console.error(chalk.red('You can try fixing the issue by updating ainx:'))
		console.error(chalk.cyan('npm i -g ainx@latest'))

		return 1
	} finally {
		process.chdir(dir)

		await fs.promises.rm(tmpDir, { recursive: true, force: true })
		if (!force) await log.ask()
	}

	return 0
}