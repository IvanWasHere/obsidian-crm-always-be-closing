/** Font files are bundled as base64 strings (esbuild `base64` loader). */
declare module '*.ttf' {
	const data: string;
	export default data;
}
