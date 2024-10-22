import { z } from "zod"

export const consoleConf = z.object({
	Signature: z.string(),
	Description: z.string(),
	Path: z.string(),
	Interval: z.string().optional()
}).array()

export type BlueprintConsoleConfig = z.infer<typeof consoleConf>