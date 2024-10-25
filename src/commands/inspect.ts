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

	const files: string[] = []

	files.push(`.blueprint/extensions/${data.id}`)

	if (conf.admin.controller) files.push(`app/Http/Controllers/Admin/Extensions/${data.id}/${data.id}ExtensionController.php`)
	files.push(`resources/views/admin/extensions/${data.id}/index.blade.php`)

	if (conf.admin.wrapper) files.push(`resources/views/blueprint/admin/wrappers/${data.id}.blade.php`)
	if (conf.dashboard?.wrapper) files.push(`resources/views/blueprint/dashboard/wrappers/${data.id}.blade.php`)

	files.push(`routes/admin-${data.id}.php`)
	if (conf.requests?.routers?.client) files.push(`routes/blueprint/client/${data.id}.php`)
	if (conf.requests?.routers?.application) files.push(`routes/blueprint/application/${data.id}.php`)
	if (conf.requests?.routers?.web) files.push(`routes/blueprint/web/${data.id}.php`)
	if (conf.requests?.app) files.push(`app/BlueprintFramework/Extensions/${data.id}`)
	if (conf.requests?.views) files.push(`resources/views/blueprint/extensions/${data.id}`)

	if (conf.database?.migrations) files.push(`database/migrations-${data.id}`)

	for (const step of data.installation) {
		if (step.type === 'copy') files.push(step.destination.replace(process.cwd(), '').slice(1))
		if (step.type === 'replace') files.push(step.file.replace(process.cwd(), '').slice(1))
	}

	console.log()
	console.log(seperator, chalk.gray('Modified Files:'))
	for (const file of files) {
		console.log(seperator, ' ', chalk.cyan(file))
	}
}