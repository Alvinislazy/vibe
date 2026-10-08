// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useModelGates } from './model-gates'

const mocks = vi.hoisted(() => ({
	invoke: vi.fn(),
	usable: vi.fn(),
	ask: vi.fn(),
	success: vi.fn(),
	error: vi.fn(),
	preference: { diarizeModelPath: null as string | null, setDiarizeEnabled: vi.fn(), setStableTimestampsEnabled: vi.fn() },
	progress: { setMessage: vi.fn(), setOpen: vi.fn(), setProgress: vi.fn() },
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/path', () => ({ join: async (...parts: string[]) => parts.join('/') }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: mocks.ask }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock('~/providers/preference', () => ({ usePreferenceProvider: () => mocks.preference }))
vi.mock('~/providers/toast', () => ({ useToastProvider: () => mocks.progress }))
vi.mock('~/lib/model', () => ({ isModelFileUsable: mocks.usable, isGgufModel: (path: string) => path.endsWith('.gguf') }))
vi.mock('~/paraglide/messages.js', () => ({ m: new Proxy({}, { get: () => () => 'message' }) }))
beforeEach(() => {
	vi.clearAllMocks()
	mocks.preference.diarizeModelPath = null
	mocks.ask.mockResolvedValue(true)
	mocks.usable.mockResolvedValue(false)
	mocks.invoke.mockImplementation(async (command: string) => (command === 'get_models_folder' ? '/models' : { status: 'cancelled' }))
})
describe('speaker model gate', () => {
	it('does not enable recognition or report success when download is cancelled', async () => {
		const { result } = renderHook(useModelGates)
		await result.current.toggleDiarization(true)
		expect(mocks.preference.setDiarizeEnabled).not.toHaveBeenCalled()
		expect(mocks.success).not.toHaveBeenCalled()
		expect(mocks.progress.setOpen).toHaveBeenLastCalledWith(false)
	})
	it('does not enable recognition when a completed download is still invalid', async () => {
		mocks.invoke.mockImplementation(async (command: string) =>
			command === 'get_models_folder' ? '/models' : { status: 'completed', path: '/models/model.gguf' },
		)
		const { result } = renderHook(useModelGates)
		await result.current.toggleDiarization(true)
		expect(mocks.preference.setDiarizeEnabled).not.toHaveBeenCalled()
		expect(mocks.error).toHaveBeenCalled()
	})
	it('checks the selected local model without downloading the default', async () => {
		mocks.preference.diarizeModelPath = '/custom/nemotron.gguf'
		mocks.usable.mockResolvedValue(true)
		const { result } = renderHook(useModelGates)
		await expect(result.current.ensureDiarizeModel()).resolves.toBe(true)
		expect(mocks.usable).toHaveBeenCalledWith('/custom/nemotron.gguf')
		expect(mocks.invoke).not.toHaveBeenCalled()
	})
	it('rejects a missing selected model instead of silently falling back', async () => {
		mocks.preference.diarizeModelPath = '/custom/nemotron.gguf'
		const { result } = renderHook(useModelGates)
		await expect(result.current.ensureDiarizeModel()).rejects.toThrow('missing or invalid')
		expect(mocks.invoke).not.toHaveBeenCalled()
	})
})
