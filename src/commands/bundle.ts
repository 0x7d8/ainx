import chalk from "chalk"
import fs from "fs"
import AdmZip from "adm-zip"
import { manifest } from "src/types/manifest"
import * as blueprint from "src/globals/blueprint"
import semver from "semver"

export type Args = {
	ainx: boolean
}

export default async function bundle(args: Args) {
	console.log(chalk.gray('Bundling Addon ...'))

	const include: string[] = [],
		files = await fs.promises.readdir('.')

	if (files.includes('include.txt')) {
		const content = await fs.promises.readFile('include.txt', 'utf-8')
		include.push(...content.split('\n').map((line) => line.trim()).filter(Boolean))
	}

	if (!files.includes('manifest.json')) {
		console.error(chalk.red('Manifest file not found'))
		process.exit(1)
	}

	const data = manifest.safeParse(JSON.parse(await fs.promises.readFile('manifest.json', 'utf-8')))
	if (!data.success) {
		console.error(chalk.red('Invalid ainx manifest'))
		process.exit(1)
	}

	const blueprintZip = files.includes(`${data.data.id}.blueprint`) ? `${data.data.id}.blueprint` : files.find((file) => file.endsWith('.blueprint'))
	if (!blueprintZip) {
		console.error(chalk.red('Blueprint file not found'))
		process.exit(1)
	}

	const bpZip = new AdmZip(blueprintZip),
		conf = blueprint.config(bpZip.readAsText('conf.yml'))

	const zip = new AdmZip(),
		ainx = new AdmZip()

	const rawManifest = JSON.parse(await fs.promises.readFile('manifest.json', 'utf-8'))

	if (!rawManifest.ainxRequirement || semver.gt('1.8.3', rawManifest.ainxRequirement)) {
		rawManifest.ainxRequirement = '1.8.3'
	}

	ainx.addFile('manifest.json', Buffer.from(JSON.stringify(rawManifest)))
	ainx.addFile('source.txt', Buffer.from('https://github.com/0x7d8/ainx'))

	for (const file of bpZip.getEntries()) {
		ainx.addFile(`addon/${file.entryName}`, file.getData())
	}

	if (!args.ainx) {
		zip.addFile(`${data.data.id}.ainx`, await ainx.toBufferPromise())
		zip.addLocalFile(blueprintZip, '', `${data.data.id}.blueprint`)

		for (const file of include) {
			const stat = await fs.promises.stat(file)

			if (stat.isDirectory()) zip.addLocalFolder(file, file)
			else zip.addLocalFile(file)
		}

		zip.addFile('install-ainx.sh', Buffer.from([
			'#!/bin/bash',
			'',
			'# Function to check if a command exists',
			'command_exists() {',
			'  command -v "$1" >/dev/null 2>&1',
			'}',
			'',
			'if [ "$EUID" -ne 0 ]; then',
			'  echo "Please run as root."',
			'  exit 1',
			'fi',
			'',
			'# Check if Node.js is installed',
			'if command_exists node; then',
			'  echo "Node.js is already installed."',
			'else',
			'  echo "Node.js is not installed. Installing Node.js version 20..."',
			'',
			'  # Install Node.js version 20 using NodeSource',
			'  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -',
			'  sudo apt-get install -y nodejs',
			'',
			'  if command_exists node; then',
			'    echo "Node.js version 20 has been successfully installed."',
			'  else',
			'    echo "Failed to install Node.js version 20. Exiting..."',
			'    exit 1',
			'  fi',
			'fi',
			'',
			'# Check if Yarn is installed',
			'if command_exists yarn; then',
			'  echo "Yarn is already installed."',
			'else',
			'  echo "Yarn is not installed. Installing Yarn..."',
			'  npm install -g yarn',
			'',
			'  if command_exists yarn; then',
			'    echo "Yarn has been successfully installed."',
			'  else',
			'    echo "Failed to install Yarn. Exiting..."',
			'    exit 1',
			'  fi',
			'fi',
			'',
			'echo "Installing Yarn packages..."',
			'if [ -f "yarn.lock" ]; then',
			'  yarn install',
			'else',
			'  echo "yarn.lock file not found. Exiting..."',
			'  echo "make sure you are in the correct directory (/var/www/pterodactyl by default)"',
			'  exit 1',
			'fi',
			'',
			'# Install ainx',
			'npm install -g ainx',
			'',
			'echo "ainx has been successfully installed."'
		].join('\n')), '', 0o755)

		zip.addFile('README.blueprint.txt', Buffer.from([
			'BLUEPRINT INSTALLATION',
			'',
			`Downloaded addon: ${conf.info.name} ${conf.info.version}`,
			conf.info.author ? `Author: ${conf.info.author}` : null,
			'',
			'(!) BLUEPRINT:',
			'Make sure blueprint is installed fully using the steps from',
			'  https://blueprint.zip/docs/?page=getting-started/Installation',
			'',
			' - Installation of the addon:',
			`  1. Copy ${data.data.id}.blueprint to your pterodactyl folder (usually /var/www/pterodactyl)`,
			'  2. Run',
			`    blueprint -install ${data.data.id}`,
			'  3. Done!',
			'',
			' - Updating the addon:',
			`  1. Copy the new ${data.data.id}.blueprint to your pterodactyl folder`,
			'  2. Run',
			`    blueprint -install ${data.data.id}`,
			'  3. Done!',
			'',
			' - Removing the addon: (only if you want to remove the addon, not update)',
			'  1. Run',
			`    blueprint -remove ${data.data.id}`,
			'  2. Done!',
			'',
			...conf.database?.migrations ? [
				'(!) Manually migrate the database:',
				'If you use a test panel before production you may need to migrate the database',
				'manually depending on how you test, you can use this command for blueprint:',
				'  php artisan migrate --force',
				'',
			] : []
		].filter((v) => v !== null).join('\n').trim()))

		zip.addFile('README.standalone.txt', Buffer.from([
			'STANDALONE INSTALLATION',
			'',
			`Downloaded addon: ${conf.info.name} ${conf.info.version}`,
			conf.info.author ? `Author: ${conf.info.author}` : null,
			'',
			...data.data.hasRemove ? [
				'(!) Custom remove script:',
				' This addon has a custom remove script you may need to run before installing/updating it with ainx, you can run it using',
				`  bash ${data.data.hasRemove}`,
				'',
			] : [],
			'(!) STANDALONE:',
			'Make sure NodeJS 16+ and Yarn are installed on your system, you can use the install-ainx.sh script to install them.',
			'To install ainx either run the script or run',
			'  npm install -g ainx',
			'',
			' - Installation of the addon:',
			'  1. Run',
			`    ainx install ${data.data.id}.ainx`,
			'  2. Follow any on-screen instructions if present, you can always exit while installing and run the command again',
			'  3. Done!',
			'',
			' - Updating the (reinstall) addon:',
			'  1. Run',
			`    ainx upgrade ${data.data.id}.ainx`,
			'  2. Done!',
			'',
			' - Updating the addon without rebuilding frontend (for modified frontends):',
			'  1. Run',
			`    ainx upgrade ${data.data.id}.ainx --rebuild=false --skipSteps`,
			'  2. Done!',
			'',
			' - Removing the addon:',
			'  1. Run',
			`    ainx remove ${data.data.id}`,
			'  2. Follow any on-screen instructions if present, you can always exit while removing and run the command again',
			'  3. Done!',
			'',
			...conf.database?.migrations ? [
				'(!) Manually migrate the database:',
				'If you use a test panel before production you may need to migrate the database',
				'manually depending on how you test, you can use this command for ainx:',
				`  php artisan migrate --path=database/migrations-${data.data.id} --force`,
				'',
			] : []
		].filter((v) => v !== null).join('\n').trim()))

		zip.addFile('README.txt', Buffer.from([
			'Thank you for your purchase!',
			`Downloaded addon: ${conf.info.name} ${conf.info.version}`,
			conf.info.author ? `Author: ${conf.info.author}` : null,
			'',
			'(i) BLUEPRINT: (https://blueprint.zip/)',
			'View the README.blueprint.txt file for instructions on how to install the addon using blueprint',
			'',
			'(i) STANDALONE: (ainx)',
			'View the README.standalone.txt file for instructions on how to install the addon using ainx (for standalone installations)',
			'',
			...files.includes('README.txt') ? [
				await fs.promises.readFile('README.txt', 'utf-8')
			] : []
		].join('\n').trim()))

		await zip.writeZipPromise(`${data.data.id}-v${conf.info.version.replaceAll('.', '')}.zip`)
	} else {
		await ainx.writeZipPromise(`${data.data.id}.ainx`)
	}

	console.log(chalk.gray('Bundling Addon ...'), chalk.bold.green('Done'))
	console.log()

	console.log(chalk.gray('Blueprint File:'), chalk.cyan(blueprintZip))
	console.log(chalk.gray('Manifest File:'), chalk.cyan('manifest.json'))
	console.log(chalk.gray('Included Files:'), chalk.cyan(include.join(', ')))
	console.log(chalk.gray('Output File:'), chalk.cyan(args.ainx ? `${data.data.id}.ainx` : `${data.data.id}-v${conf.info.version.replaceAll('.', '')}.zip`))
	console.log()
	console.log(chalk.gray('Addon:'), chalk.cyan(conf.info.name))
	console.log(chalk.gray('Version:'), chalk.cyan(conf.info.version))
}