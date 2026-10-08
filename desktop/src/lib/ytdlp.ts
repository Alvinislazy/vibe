import { platform, arch } from '@tauri-apps/plugin-os'
import { invoke } from '@tauri-apps/api/core'
import * as fs from '@tauri-apps/plugin-fs'
import * as path from '@tauri-apps/api/path'
import { ytDlpAssetNames, ytDlpDownloadUrl } from './config'

// Resolved on demand rather than at import time: `platform()` reads `window`, so touching
// it at module scope makes this file unimportable outside a webview (tests included).
function getPlatformArch() {
	return `${platform()}-${arch()}`
}

async function getBinaryPath() {
	const localDataPath = await path.appLocalDataDir()
	return await path.join(localDataPath, ytDlpAssetNames[getPlatformArch()])
}

export async function exists() {
	const binaryPath = await getBinaryPath()
	return await fs.exists(binaryPath)
}

/**
 * yt-dlp tags are calendar versions — `2026.08.19`, occasionally with a same-day suffix like
 * `2026.08.19.1`. Comparing them as plain strings makes every differing tag look like an update,
 * which is what turned the update prompt into a nag, so compare the numbers segment by segment.
 * An unknown (missing or unparsable) current version counts as older, so an update is offered.
 */
export function isNewerVersion(candidate: string, current: string | null | undefined): boolean {
	const parse = (version: string) => version.split('.').map((part) => Number.parseInt(part, 10))
	const candidateParts = parse(candidate)
	if (candidateParts.some(Number.isNaN)) return false
	if (!current) return true
	const currentParts = parse(current)
	if (currentParts.some(Number.isNaN)) return true
	for (let index = 0; index < Math.max(candidateParts.length, currentParts.length); index += 1) {
		const left = candidateParts[index] ?? 0
		const right = currentParts[index] ?? 0
		if (left !== right) return left > right
	}
	return false
}

export async function getLatestVersion(): Promise<string> {
	return await invoke<string>('get_latest_ytdlp_version')
}

export async function downloadYtDlp(version: string) {
	const url = ytDlpDownloadUrl(version, getPlatformArch())
	const binaryPath = await getBinaryPath()
	await invoke('download_file', { url, path: binaryPath })
}

export async function downloadAudio(url: string) {
	const outPath = await invoke<string>('get_temp_path', { ext: 'm4a' })
	await invoke<string>('download_audio', { url, outPath })
	return outPath
}

/** Fetch the title of a media URL via yt-dlp. Falls back to the hostname, then the URL. */
export async function getMediaTitle(url: string): Promise<string> {
	try {
		const title = await invoke<string>('get_media_title', { url })
		if (title.trim()) return title.trim()
	} catch {
		/* network or extractor failure — name from the URL instead */
	}
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

/** Every link in the box, one per line or several separated by spaces, without repeats. */
export function parseMediaLinks(input: string): string[] {
	return [...new Set(input.split(/\s+/).filter(Boolean))]
}

/** Drive folders need account-aware enumeration; the single-media downloader cannot fetch them. */
export function isGoogleDriveFolderUrl(input: string): boolean {
	try {
		const url = new URL(input)
		return url.hostname.toLowerCase() === 'drive.google.com' && /^\/drive\/(?:u\/\d+\/)?folders(?:\/|$)/i.test(url.pathname)
	} catch {
		return false
	}
}

export const GOOGLE_DRIVE_FOLDER_HELP =
	'Google Drive folder links cannot be downloaded directly. Download and unzip the folder, or sync it with Google Drive for desktop, then use Select folder. Enable Include subfolders to transcribe nested folders. Individual shared audio or video file links can be pasted here.'
