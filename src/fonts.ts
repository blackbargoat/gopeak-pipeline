import {continueRender, delayRender, staticFile} from 'remotion';

// TikTok Sans for text, Apple Color Emoji (apple-emoji-linux build, CBDT) for emoji.
// Loaded as web fonts so renders look identical on the Mac and the Windows PC.
export const TEXT_FONT = 'TikTokSans';
export const EMOJI_FONT = 'AppleEmoji';
export const FONT_STACK = `'${TEXT_FONT}', '${EMOJI_FONT}', sans-serif`;

let started = false;

export const loadFonts = () => {
	if (started || typeof document === 'undefined') return;
	started = true;
	const handle = delayRender('Loading fonts', {timeoutInMilliseconds: 120000});
	const faces = [
		new FontFace(TEXT_FONT, `url(${staticFile('fonts/TikTokSans-Bold.ttf')})`, {weight: '700'}),
		new FontFace(TEXT_FONT, `url(${staticFile('fonts/TikTokSans-Black.ttf')})`, {weight: '900'}),
		new FontFace(EMOJI_FONT, `url(${staticFile('fonts/AppleColorEmoji-Linux.ttf')})`),
	];
	Promise.all(faces.map((f) => f.load()))
		.then((loaded) => {
			loaded.forEach((f) => document.fonts.add(f));
			continueRender(handle);
		})
		.catch((err) => {
			console.error('Font load failed', err);
			continueRender(handle);
		});
};
