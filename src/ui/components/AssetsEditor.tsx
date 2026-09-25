import { TFile } from 'obsidian';
import { openFilePicker } from '../../obsidian/modals';
import { usePlugin } from '../hooks/usePlugin';
import { NoteLink } from './NoteLink';
import { Icon } from './Icon';

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

function iconFor(path: string): string {
	if (IMAGE.test(path)) return 'image';
	if (/\.pdf$/i.test(path)) return 'file-text';
	if (/\.md$/i.test(path)) return 'file';
	if (/\.(mp4|mov|webm)$/i.test(path)) return 'film';
	if (/\.(mp3|wav|m4a|ogg)$/i.test(path)) return 'music';
	return 'paperclip';
}

interface Props {
	/** Vault paths of the linked files. */
	value: string[];
	onChange: (paths: string[]) => void;
	id?: string;
}

/** Files linked to a project: pick any vault file; images get a thumbnail. */
export function AssetsEditor({ value, onChange, id }: Props) {
	const { app, plugin } = usePlugin();
	return (
		<div className="abc-assets" id={id}>
			{value.length > 0 && (
				<ul>
					{value.map((path) => {
						const file = app.vault.getAbstractFileByPath(path);
						const name = path.split('/').pop()!;
						return (
							<li key={path}>
								{file instanceof TFile && IMAGE.test(path) ? (
									<img className="abc-asset-thumb" src={app.vault.getResourcePath(file)} alt="" />
								) : (
									<Icon name={iconFor(path)} className="abc-asset-icon" />
								)}
								<NoteLink path={path}>{name.replace(/\.md$/i, '')}</NoteLink>
								<button
									type="button"
									className="clickable-icon"
									aria-label={`Remove ${name}`}
									onClick={() => onChange(value.filter((p) => p !== path))}
								>
									×
								</button>
							</li>
						);
					})}
				</ul>
			)}
			<button
				type="button"
				onClick={() => openFilePicker(plugin, value, (file) => onChange([...value, file.path]))}
			>
				<Icon name="paperclip" /> Add file
			</button>
		</div>
	);
}
