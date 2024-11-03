import { manifest } from "src/types/manifest"
import { BlueprintConfig } from "src/types/blueprint/conf"
import AdmZip from "adm-zip"
import * as blueprint from "src/globals/blueprint"
import { z } from "zod"
import path from "path"

export function parse(file: string | Buffer, excludedFlags: string[] = []): [manifest: z.infer<typeof manifest>, blueprint: BlueprintConfig, zip: AdmZip] {
	const zip = new AdmZip(file),
		manifestFile = zip.readAsText('manifest.json')

	let conf: string
	const blueprintZip = zip.getEntry('addon.blueprint')
	if (blueprintZip) {
		conf = new AdmZip(blueprintZip.getData()).readAsText('conf.yml')
	} else {
		conf = zip.readAsText('addon/conf.yml')
	}

	return [manifest.parse(JSON.parse(manifestFile)), blueprint.config(conf, excludedFlags), zip]
}

export function unpack(zip: AdmZip, location: string): { path(): string } {
	const blueprintZip = zip.getEntry('addon.blueprint')

	if (blueprintZip) {
		new AdmZip(blueprintZip.getData()).extractAllTo(location, true, true)
	} else {
		zip.extractEntryTo(zip.getEntry('addon/')!, location.split(path.sep).slice(0, -1).join(path.sep), true, true)
	}

	return {
		path() {
			return location
		}
	}
}