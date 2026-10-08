import { ChevronRight, SlidersHorizontal, AudioLines } from 'lucide-react'
import { DEFAULT_MODEL_OPTIONS } from '~/providers/preference'
import { m } from '~/paraglide/messages.js'
import { open } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { useState } from 'react'
import { isGgufModel, isModelFileUsable } from '~/lib/model'
import { Button } from '~/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { ActionRow, SettingsGroup, SettingsNote, SettingsRow, type SettingsViewModel } from './shared'

export function TuningSection({ vm, onOpenWhisper, onOpenAudio }: { vm: SettingsViewModel; onOpenWhisper: () => void; onOpenAudio: () => void }) {
	const [choosingModel, setChoosingModel] = useState(false)
	async function chooseSpeakerModel() {
		setChoosingModel(true)
		try {
			const path = await open({ multiple: false, filters: [{ name: 'Nemotron-3-Diarization GGUF', extensions: ['gguf'] }] })
			if (!path) return
			if (!isGgufModel(path) || !(await isModelFileUsable(path))) throw new Error('Choose a valid Nemotron-3-Diarization GGUF file.')
			vm.preference.setDiarizeModelPath(path)
		} catch (error) {
			toast.error(String(error))
		} finally {
			setChoosingModel(false)
		}
	}
	const options = vm.preference.modelOptions
	const customized =
		Boolean(options.translate) ||
		(Object.keys(DEFAULT_MODEL_OPTIONS) as (keyof typeof DEFAULT_MODEL_OPTIONS)[])
			.filter((key) => key !== 'lang' && key !== 'verbose')
			.some((key) => (options[key] ?? DEFAULT_MODEL_OPTIONS[key]) !== DEFAULT_MODEL_OPTIONS[key])

	return (
		<div className="space-y-6">
			<SettingsGroup>
				<SettingsRow label={m.enableDiarization()} description={m.infoDiarization()}>
					<Switch checked={vm.preference.diarizeEnabled} onCheckedChange={vm.toggleDiarization} />
				</SettingsRow>
				<SettingsRow label="Speaker recognition model" description={vm.preference.diarizeModelPath ?? 'Nemotron-3-Diarization Q8_0 · recommended'}>
					<Select
						value={vm.preference.diarizeModelPath ? 'custom' : 'recommended'}
						onValueChange={(value) => {
							if (value === 'recommended') vm.preference.setDiarizeModelPath(null)
							else void chooseSpeakerModel()
						}}
						disabled={choosingModel}>
						<SelectTrigger className="h-9 w-48 rounded-lg">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="recommended">Nemotron Q8_0</SelectItem>
							<SelectItem value="custom">Local Nemotron GGUF</SelectItem>
						</SelectContent>
					</Select>
					{vm.preference.diarizeModelPath && (
						<Button variant="outline" size="sm" disabled={choosingModel} onClick={() => void chooseSpeakerModel()}>
							Choose file
						</Button>
					)}
				</SettingsRow>
				<SettingsNote>
					This build supports Nemotron-3-Diarization GGUF models. Select the recommended model or a compatible local export. Speaker labels
					distinguish voices; they do not identify people by name.
				</SettingsNote>
				{vm.preference.diarizeEnabled && <SettingsNote>{m.diarizeMaxSpeakersNote()}</SettingsNote>}
				<SettingsRow label={m.enableStableTimestamps()} description={m.stableTimestampsInfo()}>
					<Switch checked={vm.preference.stableTimestampsEnabled} onCheckedChange={vm.handleStableTimestampsToggle} />
				</SettingsRow>
				{vm.preference.stableTimestampsEnabled && <SettingsNote>{m.stableTimestampsSlowNote()}</SettingsNote>}
			</SettingsGroup>
			<SettingsGroup>
				<ActionRow
					label={
						<span className="flex items-center gap-2">
							<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
							{m.whisperOptions()}
							{customized && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{m.tuningCustomized()}</span>}
						</span>
					}
					description={m.whisperOptionsInfo()}
					icon={<ChevronRight className="h-4 w-4 rtl:rotate-180" />}
					activateOnClick
					onClick={onOpenWhisper}
				/>
				<ActionRow
					label={
						<span className="flex items-center gap-2">
							<AudioLines className="h-4 w-4 text-muted-foreground" />
							{m.audioProcessing()}
						</span>
					}
					description={m.audioProcessingInfo()}
					icon={<ChevronRight className="h-4 w-4 rtl:rotate-180" />}
					activateOnClick
					onClick={onOpenAudio}
				/>
			</SettingsGroup>
		</div>
	)
}
