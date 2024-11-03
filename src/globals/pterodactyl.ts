import fs from "fs"

export function version(): string | null {
	try {
		const appConfig = fs.readFileSync('config/app.php', 'utf8'),
			match = appConfig.match(/'version' => '(.*)'/)

		if (!match) return null
		return match[1]
	} catch {
		return null
	}
}