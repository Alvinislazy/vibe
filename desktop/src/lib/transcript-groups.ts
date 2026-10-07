import * as fs from '@tauri-apps/plugin-fs'
import * as pathApi from '@tauri-apps/api/path'
import { GROUP_FILENAME, TRANSCRIPT_FILENAME, TRANSCRIPTS_FOLDER, type TranscriptEntry } from './transcripts-store'

export { GROUP_FILENAME }

export interface GroupRecord {
	version: number
	name: string
	createdAt: string
}

export interface TranscriptGroup {
	path: string
	name: string
	createdAt: Date
	items: TranscriptEntry[]
}

export type SidebarItem = { type: 'single'; entry: TranscriptEntry } | { type: 'group'; group: TranscriptGroup }

function pad(value: number, length = 2) {
	return String(value).padStart(length, '0')
}

function stamp(date: Date) {
	return (
		`${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
	)
}

const stampPattern = /-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/

function parseStamp(stem: string): { name: string; createdAt: Date } {
	const match = stem.match(stampPattern)
	if (!match) return { name: stem, createdAt: new Date(0) }
	const [, year, month, day, hours, minutes, seconds] = match
	const createdAt = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds))
	return {
		name: stem.slice(0, match.index) || stem,
		createdAt: Number.isNaN(createdAt.getTime()) ? new Date(0) : createdAt,
	}
}

function toFileStem(name: string) {
	const withoutExtension = name.replace(/\.[^./\\]+$/, '')
	const cleaned = withoutExtension
		.replace(/[/\\?%*:|"<>]/g, '-')
		// eslint-disable-next-line no-control-regex
		.replace(/[\u0000-\u001f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '')
	return (cleaned || 'group').slice(0, 120)
}

/** Create a group folder in the projects directory and write its initial group.vibe.json */
export async function createGroup(name: string, projectsPath?: string | null): Promise<string> {
	const root = projectsPath || (await pathApi.join(await pathApi.documentDir(), TRANSCRIPTS_FOLDER))
	if (!(await fs.exists(root))) await fs.mkdir(root, { recursive: true })

	const createdAt = new Date()
	const stem = `Group-${toFileStem(name)}`
	const suffix = stamp(createdAt)

	let groupFolder = ''
	for (let attempt = 1; ; attempt += 1) {
		const folderName = attempt === 1 ? `${stem}-${suffix}` : `${stem}-${attempt}-${suffix}`
		const candidate = await pathApi.join(root, folderName)
		try {
			await fs.mkdir(candidate)
			groupFolder = candidate
			break
		} catch (error) {
			if (await fs.exists(candidate)) continue
			throw error
		}
	}

	const recordPath = await pathApi.join(groupFolder, GROUP_FILENAME)
	const record: GroupRecord = {
		version: 1,
		name,
		createdAt: createdAt.toISOString(),
	}
	await fs.writeTextFile(recordPath, JSON.stringify(record, null, '\t'))
	return groupFolder
}

/** Read a group's metadata record. */
export async function readGroupRecord(recordPath: string): Promise<GroupRecord | null> {
	try {
		const raw = await fs.readTextFile(recordPath)
		const parsed = JSON.parse(raw) as Partial<GroupRecord>
		if (typeof parsed.name === 'string') {
			return {
				version: parsed.version ?? 1,
				name: parsed.name,
				createdAt: parsed.createdAt ?? new Date(0).toISOString(),
			}
		}
		return null
	} catch {
		return null
	}
}

/** List all sidebar items: both standalone transcripts and folder groups with their children. */
export async function listSidebarItems(projectsPath?: string | null): Promise<SidebarItem[]> {
	try {
		const folder = projectsPath || (await pathApi.join(await pathApi.documentDir(), TRANSCRIPTS_FOLDER))
		if (!(await fs.exists(folder))) return []
		const entries = await fs.readDir(folder)
		const items: SidebarItem[] = []

		for (const entry of entries) {
			if (!entry.isDirectory) {
				if (entry.name.endsWith('.vibe.json')) {
					const stem = entry.name.slice(0, -'.vibe.json'.length)
					const { name, createdAt } = parseStamp(stem)
					items.push({
						type: 'single',
						entry: { path: await pathApi.join(folder, entry.name), name, createdAt },
					})
				}
				continue
			}

			const groupRecordPath = await pathApi.join(folder, entry.name, GROUP_FILENAME)
			const isGroup = await fs.exists(groupRecordPath)

			if (isGroup) {
				const groupRecord = await readGroupRecord(groupRecordPath)
				const groupCreatedAt = groupRecord?.createdAt ? new Date(groupRecord.createdAt) : parseStamp(entry.name).createdAt
				const groupName = groupRecord?.name || parseStamp(entry.name).name

				const childEntries = await fs.readDir(await pathApi.join(folder, entry.name))
				const children: TranscriptEntry[] = []

				for (const child of childEntries) {
					if (!child.isDirectory) continue
					const childRecord = await pathApi.join(folder, entry.name, child.name, TRANSCRIPT_FILENAME)
					if (!(await fs.exists(childRecord))) continue
					const { name, createdAt } = parseStamp(child.name)
					children.push({ path: childRecord, name, createdAt })
				}

				children.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name))

				items.push({
					type: 'group',
					group: {
						path: await pathApi.join(folder, entry.name),
						name: groupName,
						createdAt: groupCreatedAt,
						items: children,
					},
				})
				continue
			}

			// Not a group, check if it's a standalone project folder
			const record = await pathApi.join(folder, entry.name, TRANSCRIPT_FILENAME)
			if (await fs.exists(record)) {
				const { name, createdAt } = parseStamp(entry.name)
				items.push({
					type: 'single',
					entry: { path: record, name, createdAt },
				})
			}
		}

		return items.sort((a, b) => {
			const timeA = a.type === 'single' ? a.entry.createdAt.getTime() : a.group.createdAt.getTime()
			const timeB = b.type === 'single' ? b.entry.createdAt.getTime() : b.group.createdAt.getTime()
			return timeB - timeA
		})
	} catch (error) {
		console.warn('failed to list sidebar items:', error)
		return []
	}
}

/** Rename a folder group. */
export async function renameGroup(groupPath: string, nextName: string): Promise<boolean> {
	try {
		const recordPath = await pathApi.join(groupPath, GROUP_FILENAME)
		const existing = await readGroupRecord(recordPath)
		const updated: GroupRecord = {
			version: existing?.version ?? 1,
			name: nextName.trim(),
			createdAt: existing?.createdAt ?? new Date().toISOString(),
		}
		await fs.writeTextFile(recordPath, JSON.stringify(updated, null, '\t'))
		return true
	} catch (error) {
		console.warn('failed to rename group:', error)
		return false
	}
}

/** Delete an entire group folder and all its contents. */
export async function deleteGroup(groupPath: string): Promise<boolean> {
	try {
		await fs.remove(groupPath, { recursive: true })
		return true
	} catch (error) {
		console.warn('failed to delete group:', error)
		return false
	}
}
