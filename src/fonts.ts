import {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';

// TikTok Sans for text, Apple Color Emoji (apple-emoji-linux build, CBDT) for emoji.
// Loaded as web fonts so renders look identical on the Mac and the Windows PC.
export const TEXT_FONT = 'TikTokSans';
export const EMOJI_FONT = 'AppleEmoji';
export const FONT_STACK = `'${TEXT_FONT}', '${EMOJI_FONT}', sans-serif`;
// CapCut "Classic" / TikTok classic text = Proxima Nova Semibold.
export const CLASSIC_FONT = 'CapCutClassic';
export const CLASSIC_STACK = `'${CLASSIC_FONT}', '${EMOJI_FONT}', sans-serif`;

let started = false;
let ready = false;
const listeners = new Set<() => void>();

// Text that is sized by measuring must wait for the real font, or the measurement is cached wrong.
export const useFontsReady = () => {
	const [ok, setOk] = useState(ready);
	useEffect(() => {
		if (ready) return setOk(true);
		const fn = () => setOk(true);
		listeners.add(fn);
		return () => void listeners.delete(fn);
	}, []);
	return ok;
};

export const loadFonts = () => {
	if (started || typeof document === 'undefined') return;
	started = true;
	const handle = delayRender('Loading fonts', {timeoutInMilliseconds: 120000});
	const faces = [
		new FontFace(TEXT_FONT, `url(${staticFile('fonts/TikTokSans-Bold.ttf')})`, {weight: '700'}),
		new FontFace(TEXT_FONT, `url(${staticFile('fonts/TikTokSans-Black.ttf')})`, {weight: '900'}),
		new FontFace(EMOJI_FONT, `url(${staticFile('fonts/AppleColorEmoji-Linux.ttf')})`),
		new FontFace(CLASSIC_FONT, `url(${staticFile('fonts/ProximaNova-Semibold.otf')})`, {weight: '600'}),
	];
	Promise.all(faces.map((f) => f.load()))
		.then((loaded) => {
			loaded.forEach((f) => document.fonts.add(f));
			ready = true;
			listeners.forEach((fn) => fn());
			// let React re-render with the real metrics before frames are captured
			requestAnimationFrame(() => requestAnimationFrame(() => continueRender(handle)));
		})
		.catch((err) => {
			console.error('Font load failed', err);
			continueRender(handle);
		});
};
