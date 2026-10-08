// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioDownload } from './use-audio-download'

const mocks = vi.hoisted(() => ({ download: vi.fn(), title: vi.fn(), toast: vi.fn(), setFiles: vi.fn() }))
vi.mock('@tauri-apps/api', () => ({ event: { emit: vi.fn() } }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('sonner', () => ({ toast: { error: mocks.toast, warning: vi.fn(), message: vi.fn() } }))
vi.mock('~/providers/preference', () => ({ usePreferenceProvider: () => ({ setHomeTab: vi.fn(), shouldCheckYtDlpVersion: false }) }))
vi.mock('~/providers/files-provider', () => ({ useFilesContext: () => ({ setFiles: mocks.setFiles }) }))
vi.mock('~/providers/toast', () => ({ useToastProvider: () => ({}) }))
vi.mock('~/lib/transcript-groups', () => ({ createGroup: vi.fn(async () => '/group') }))
vi.mock('~/lib/ytdlp', async (original) => ({
	...(await original<typeof import('~/lib/ytdlp')>()),
	downloadAudio: mocks.download,
	getMediaTitle: mocks.title,
}))

const folder = 'https://drive.google.com/drive/folders/shared-folder'
const file = 'https://drive.google.com/file/d/media/view'

describe('Google Drive folder download handling', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.download.mockResolvedValue('/temp/audio.m4a')
		mocks.title.mockResolvedValue('Interview')
	})
	it('keeps the folder URL and explains how to transcribe a local copy without launching a download', async () => {
		const transcribe = vi.fn()
		const { result } = renderHook(() => useAudioDownload(transcribe))
		act(() => result.current.setAudioUrl(folder))
		await act(async () => result.current.downloadAudio())
		expect(mocks.download).not.toHaveBeenCalled()
		expect(transcribe).not.toHaveBeenCalled()
		expect(result.current.audioUrl).toBe(folder)
		expect(mocks.toast).toHaveBeenCalledWith(
			'Google Drive folder needs a local copy',
			expect.objectContaining({ description: expect.stringContaining('Select folder') }),
		)
	})
	it('downloads individual files while preserving rejected folders in a mixed batch', async () => {
		const transcribe = vi.fn(async () => {})
		const { result } = renderHook(() => useAudioDownload(transcribe))
		act(() => result.current.setAudioUrl(`${folder}\n${file}`))
		await act(async () => result.current.downloadAudio())
		expect(mocks.download).toHaveBeenCalledExactlyOnceWith(file)
		expect(result.current.queuedLinks).toEqual([folder])
		expect(transcribe).toHaveBeenCalledWith(['/temp/audio.m4a'], ['Interview'], undefined)
	})
})
