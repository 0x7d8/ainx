import { z } from "zod"

const bpFileTransformer = (s: string) => s.replaceAll('(blueprint)', '/tmp/ainx/addon')
const panelFileTransformer = (s: string) => s.replaceAll('(panel)', process.cwd())

export const step = z.union([
	z.object({
		type: z.literal('copy'),

		source: z.string().transform(bpFileTransformer).transform(panelFileTransformer),
		destination: z.string().transform(panelFileTransformer)
	}),
	z.object({
		type: z.literal('remove'),

		path: z.string().transform(panelFileTransformer)
	}),
	z.object({
		type: z.literal('replace'),

		file: z.string().transform(panelFileTransformer),
		search: z.string(),
		replace: z.string(),
		matches: z.string().array().optional(),
		newline: z.boolean().optional(),
		global: z.boolean().optional(),
		unique: z.boolean().optional()
	}),
	z.object({
		type: z.literal('dashboard-route'),

		after: z.object({
			path: z.string(),
			name: z.string(),
			permission: z.string(),
			component: z.string()
		}),

		path: z.string(),
		name: z.string(),
		permission: z.string(),
		component: z.string(),
		componentPath: z.string()
	})
])

export const manifest = z.object({
	id: z.string(),
	hasRemove: z.string().optional(),
	installation: step.array(),
	removal: step.array().optional()
})