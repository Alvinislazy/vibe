import { invoke } from '@tauri-apps/api/core'
import * as pathApi from '@tauri-apps/api/path'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { MoreHorizontal } from 'lucide-react'
import { useCallback, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '~/components/ui/dropdown-menu'
import { cn } from '~/lib/style'
import { deleteTranscript, readTranscript, renameTranscript, resolveProjectAudio, type TranscriptEntry } from '~/lib/transcripts-store'
import { useSession } from '../session'
import RetranscribeDialog from './retranscribe-dialog'

/** "just now" / "14m ago" / "3h ago" / "2d ago" / "Aug 19" / "Aug 19, 2024" */
export function relativeDate(date: Date) {
	const time = date.getTime()
	if (!time) return ''
	const minutes = Math.floor((Date.now() - time) / 60_000)
	if (minutes < 1) return m.justNow()
	if (minutes < 60) return m.minutesAgo({ minutes: String(minutes) })
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return m.hoursAgo({ hours: String(hours) })
	const days = Math.floor(hours / 24)
	if (days < 7) return m.daysAgo({ days: String(days) })
	const sameYear = date.getFullYear() === new Date().getFullYear()
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

interface RowMenuState {
	/** media to re-transcribe: the original file, else the project folder's copy; null when neither */
	sourcePath: string | null
	sourceExists: boolean
}

export function RecentRow({
	entry,
	active,
	disabled,
	indent,
	onOpen,
	onDeleted,
	onRenamed,
}: {
	entry: TranscriptEntry
	active: boolean
	disabled: boolean
	indent?: boolean
	onOpen: () => void
	onDeleted: () => void
	onRenamed: () => void
}) {
	const { queue } = useSession()
	const [menu, setMenu] = useState<RowMenuState>({ sourcePath: null, sourceExists: false })
	const [renaming, setRenaming] = useState(false)
	const [retranscribing, setRetranscribing] = useState(false)
	const [draftName, setDraftName] = useState(entry.name)

	// The list is built from names only, so the media is located lazily — the first time the row's
	// menu opens — to decide whether "Re-transcribe" can do anything. The original file wins; the
	// project folder's copy keeps re-transcribing possible once the original is gone.
	const loadSource = useCallback(async () => {
		const record = await readTranscript(entry.path)
		if (!record) {
			setMenu({ sourcePath: null, sourceExists: false })
			return
		}
		let sourceExists = false
		try {
			sourceExists = !!record.sourcePath && (await fs.exists(record.sourcePath))
		} catch (error) {
			console.warn('failed to check source file:', error)
		}
		if (sourceExists) {
			setMenu({ sourcePath: record.sourcePath, sourceExists: true })
			return
		}
		const copy = await resolveProjectAudio(entry.path, record)
		setMenu({ sourcePath: copy ?? (record.sourcePath || null), sourceExists: !!copy })
	}, [entry.path])

	async function reveal() {
		try {
			await invoke('open_path', { path: await pathApi.dirname(entry.path) })
		} catch (error) {
			console.warn('failed to reveal transcript:', error)
		}
	}

	async function remove() {
		const confirmed = await dialog.ask(m.deleteTranscriptBody({ name: entry.name }), {
			title: m.deleteTranscript(),
			kind: 'warning',
		})
		if (!confirmed) return
		const ok = await deleteTranscript(entry.path)
		if (ok) {
			if (queue.selectedJob?.savedPath === entry.path) queue.reset()
			onDeleted()
		}
	}

	function commitRename() {
		const next = draftName.trim()
		setRenaming(false)
		if (!next || next === entry.name) return
		if (active && queue.selectedJob) {
			void queue.renameJob(queue.selectedJob.id, next).then((ok) => ok && onRenamed())
			return
		}
		void renameTranscript(entry.path, next).then((renamed) => renamed && onRenamed())
	}

	function retranscribe() {
		if (!menu.sourcePath || !menu.sourceExists) return
		queue.enqueue([{ name: entry.name, path: menu.sourcePath, projectName: entry.name }])
	}

	if (renaming) {
		return (
			<div className={cn('flex items-center rounded-xl bg-muted px-2 py-1.5', indent && 'ms-4')}>
				<input
					autoFocus
					value={draftName}
					onChange={(event) => setDraftName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') commitRename()
						if (event.key === 'Escape') setRenaming(false)
					}}
					onBlur={commitRename}
					aria-label={m.transcriptName()}
					className="h-7 w-full min-w-0 rounded-lg border border-ring/40 bg-background px-2 text-[13px] text-foreground outline-none"
				/>
			</div>
		)
	}

	return (
		<div
			className={cn(
				'group relative flex items-center rounded-xl transition-colors duration-150',
				active ? 'bg-muted' : 'hover:bg-muted/60',
				indent && 'ms-4',
			)}>
			<RetranscribeDialog open={retranscribing} onOpenChange={setRetranscribing} name={entry.name} onConfirm={retranscribe} />

			<button
				type="button"
				onClick={onOpen}
				disabled={disabled}
				title={entry.name}
				className="min-w-0 flex-1 cursor-pointer px-3 py-2 text-start disabled:cursor-default disabled:opacity-50">
				<p className="truncate text-[13px] font-medium text-foreground">{entry.name}</p>
				<p className="mt-0.5 text-[11px] text-muted-foreground">{relativeDate(entry.createdAt)}</p>
			</button>

			<DropdownMenu onOpenChange={(open) => open && void loadSource()}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label={m.transcriptActions()}
						className="me-1.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-opacity duration-150 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 hover:text-foreground">
						<MoreHorizontal className="h-4 w-4" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem disabled={disabled || !menu.sourceExists} onSelect={() => setRetranscribing(true)}>
						{m.reTranscribe()}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => {
							setDraftName(entry.name)
							setRenaming(true)
						}}>
						{m.rename()}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void reveal()}>{m.showInFolder()}</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => void remove()}>
						{m.delete()}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
