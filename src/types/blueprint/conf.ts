import { z } from "zod"

export const flags = z.union([
	z.literal('ignorePlaceholders'),
	z.literal('forceLegacyPlaceholders'),
	z.literal('hasInstallScript'),
	z.literal('hasRemovalScript')
]).array()

export const conf = z.object({
	info: z.object({
		identifier: z.string(),
		name: z.string(),
		version: z.string(),
		target: z.string(),
		flags: z.string().transform((s) => flags.parse(s.split(',').map((s) => s.trim()))).optional(),
		author: z.string().optional(),
		website: z.string().optional()
	}),

	requests: z.object({
		controllers: z.string().optional(),
		app: z.string().optional(),
		routers: z.object({
			client: z.string().optional(),
			application: z.string().optional(),
			web: z.string().optional()
		}).optional()
	}).optional(),

	admin: z.object({
		view: z.string(),
		css: z.string().optional()
	}),

	dashboard: z.object({
		css: z.string().optional()
	}).optional(),

	data: z.object({
		public: z.string().optional(),
		directory: z.string().optional()
	}).optional(),

	database: z.object({
		migrations: z.string().optional()
	}).optional()
}).transform((data) => {
	if (!data.requests?.app && data.requests?.controllers) data.requests.app = data.requests.controllers

	return data
})

export type BlueprintConfig = z.infer<typeof conf>