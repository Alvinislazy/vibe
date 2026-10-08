import { describe, expect, it } from 'vitest'
import { isGoogleDriveFolderUrl, isNewerVersion, parseMediaLinks } from './ytdlp'

describe('isNewerVersion', () => {
	it('compares calendar versions by number, not as strings', () => {
		expect(isNewerVersion('2026.08.19', '2026.02.04')).toBe(true)
		expect(isNewerVersion('2026.02.04', '2026.08.19')).toBe(false)
		// The string compare this replaces got these two backwards.
		expect(isNewerVersion('2026.10.01', '2026.09.30')).toBe(true)
		expect(isNewerVersion('2026.09.30', '2026.10.01')).toBe(false)
	})

	it('treats the same version as not newer, which is what stops the nagging', () => {
		expect(isNewerVersion('2026.08.19', '2026.08.19')).toBe(false)
	})

	it('handles the same-day suffix yt-dlp occasionally publishes', () => {
		expect(isNewerVersion('2026.08.19.1', '2026.08.19')).toBe(true)
		expect(isNewerVersion('2026.08.19', '2026.08.19.1')).toBe(false)
	})

	it('offers an update when nothing is installed or the stored version is junk', () => {
		expect(isNewerVersion('2026.08.19', null)).toBe(true)
		expect(isNewerVersion('2026.08.19', undefined)).toBe(true)
		expect(isNewerVersion('2026.08.19', 'nightly')).toBe(true)
	})

	it('never prompts on a candidate it cannot parse', () => {
		expect(isNewerVersion('nightly', '2026.08.19')).toBe(false)
		expect(isNewerVersion('', '2026.08.19')).toBe(false)
	})
})

describe('parseMediaLinks', () => {
	it('takes one link per line, or several on a line, without repeats', () => {
		expect(parseMediaLinks('https://a.example/1\nhttps://a.example/2\r\n\n  https://a.example/1 https://a.example/3  ')).toEqual([
			'https://a.example/1',
			'https://a.example/2',
			'https://a.example/3',
		])
		expect(parseMediaLinks('   ')).toEqual([])
	})
})

describe('isGoogleDriveFolderUrl', () => {
	it('recognizes shared and account-specific Drive folder links', () => {
		expect(isGoogleDriveFolderUrl('https://drive.google.com/drive/folders/abc?usp=sharing')).toBe(true)
		expect(isGoogleDriveFolderUrl('https://drive.google.com/drive/u/0/folders/abc')).toBe(true)
	})
	it('allows individual Drive files and does not match lookalike hosts', () => {
		expect(isGoogleDriveFolderUrl('https://drive.google.com/file/d/abc/view')).toBe(false)
		expect(isGoogleDriveFolderUrl('https://drive.google.com/uc?id=abc&export=download')).toBe(false)
		expect(isGoogleDriveFolderUrl('https://drive.google.com.example/drive/folders/abc')).toBe(false)
		expect(isGoogleDriveFolderUrl('not a url')).toBe(false)
	})
})
