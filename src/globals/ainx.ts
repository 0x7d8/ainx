import { manifest } from "src/types/manifest"
import { BlueprintConfig } from "src/types/blueprint/conf"
import AdmZip from "adm-zip"
import * as blueprint from "src/globals/blueprint"
import { z } from "zod"
import { rm } from "fs"

export function parse(file: string | Buffer): [manifest: z.infer<typeof manifest>, blueprint: BlueprintConfig, zip: AdmZip] {
	const zip = new AdmZip(file)

	const manifestFile = zip.readAsText('manifest.json')

	let conf: string
	const blueprintZip = zip.getEntry('addon.blueprint')
	if (blueprintZip) {
		conf = new AdmZip(blueprintZip.getData()).readAsText('conf.yml')
	} else {
		conf = zip.readAsText('addon/conf.yml')
	}

	return [manifest.parse(JSON.parse(manifestFile)), blueprint.config(conf), zip]
}

export function unpack(zip: AdmZip, location: string): { path(): string } {
	const blueprintZip = zip.getEntry('addon.blueprint')

	if (blueprintZip) {
		new AdmZip(blueprintZip.getData()).extractAllTo(location, true, true)
	} else {
		zip.extractEntryTo(zip.getEntry('addon/')!, location.split('/').slice(0, -1).join('/'), true, true)
	}

	return {
		path() {
			return location
		}
	}
}