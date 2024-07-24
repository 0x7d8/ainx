import chalk from "chalk"
import fs from "fs"
import AdmZip from "adm-zip"
import { manifest } from "src/types/manifest"
import yaml from "js-yaml"

export type Args = {}

export default async function bundle(args: Args) {
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

	const blueprintZip = files.find((file) => file.endsWith('.blueprint'))
	if (!blueprintZip) {
		console.error(chalk.red('Blueprint file not found'))
		process.exit(1)
	}

	const bpZip = new AdmZip(blueprintZip)
	const conf = yaml.load(bpZip.readAsText('conf.yml')) as {
		info: {
			name: string
			version: string
		}

		database?: {
			migrations?: string
		}
	}

	const zip = new AdmZip(),
		ainx = new AdmZip()

	ainx.addLocalFile('manifest.json')
	ainx.addLocalFile(blueprintZip, '', 'addon.blueprint')

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
		'# Check if Node.js is installed and its version is 18 or higher',
		'if command_exists node && [[ "$(node --version)" =~ ^v(1[8-9]|[2-9][0-9])\. ]]; then',
		'  echo "Node.js version 18 or higher is already installed."',
		'else',
		'  echo "Node.js version 18 or higher is not installed. Installing Node.js version 20..."',
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
		'  export NODE_OPTIONS=--openssl-legacy-provider',
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

	zip.addFile('README.txt', Buffer.from([
		'This is an ainx bundled blueprint addon, this means you can either',
		'use blueprint to install it or use the ainx installer to install it.',
		`downloaded addon: ${conf.info.name} ${conf.info.version}`,
		'',
		'If you are using blueprint: (https://blueprint.zip/)',
		' Installing:',
		`  1. Extract ${data.data.id}.blueprint to your pterodactyl folder`,
		`  2. Run blueprint -install ${data.data.id}`,
		' Updating:',
		`  1. Extract the new ${data.data.id}.blueprint to your pterodactyl folder`,
		`  2. Run blueprint -install ${data.data.id}`,
		' Removing:',
		`  1. Run blueprint -remove ${data.data.id}`,
		'',
		'If you are using ainx (standalone):',
		' Install / Update ainx:',
		'  bash ./install-ainx.sh',
		'',
		' Installing:',
		`  1. Run ainx install ${data.data.id}.ainx`,
		' Updating:',
		`  1. Run ainx upgrade ${data.data.id}.ainx`,
		' Removing:',
		`  1. Run ainx remove ${data.data.id}`,
		'',
		...conf.database?.migrations ? [
			'(!) Manually migrate the database:',
			' If you use a test panel before production you may need to migrate the database',
			' manually depending on how you test, you can use this command:',
			`  php artisan migrate --path=database/migrations-${data.data.id} --force`,
			'',
		] : [],
		...data.data.hasRemove ? [
			'(!) Custom remove script:',
			' This addon has a custom remove script you may need to run before installing/updating it with ainx, you can run it using',
			`  bash ${data.data.hasRemove}`,
			'',
		] : [],
		...files.includes('README.txt') ? [
			await fs.promises.readFile('README.txt', 'utf-8')
		] : []
	].join('\n').trim()))

	await zip.writeZipPromise(`${data.data.id}.zip`)

	console.log(chalk.green('Addon Bundled'))
}