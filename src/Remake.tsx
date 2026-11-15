import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Loop, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT_STACK, loadFonts} from './fonts';
import {RichText} from './RichText';
import {SAFE} from './safe';

loadFonts();

// Recreates a reference outlier 1:1 with Mav's face clip: TikTok's native text look
// (TikTok Sans, white, thin dark outline), same text/positions/timing/audio, GoPeak screen as the payoff.
export type RemakeText = {text: string; y: number; size: number; from?: number; to?: number};
export type RemakeApp = {
	image: string;
	atSec: number;
	fadeSec: number;
	header: string | null;
	headerY: number;
	y: number;
	width: number;
};
export type RemakeProps = {
	face: string; // ping-pong face loop inside public/
	faceLoopSec: number;
	durationSec: number;
	audio: string;
	texts: RemakeText[];
	app: RemakeApp | null;
	appAspect: number; // image height / width
};

// Keeps every line inside the safe width: shrink the font if the longest line would overflow.
const fit = (text: string, size: number) => {
	const longest = Math.max(...text.split('\n').map((l) => [...l].length));
	const est = longest * size * 0.53;
	return est > SAFE.width - 40 ? Math.floor((size * (SAFE.width - 40)) / est) : size;
};

const NativeText: React.FC<{text: string; y: number; size: number; opacity?: number}> = ({text, y, size, opacity = 1}) => {
	const s = fit(text, size);
	return (
		<div
			style={{
				position: 'absolute',
				left: SAFE.left,
				width: SAFE.width,
				top: y,
				transform: 'translateY(-50%)',
				textAlign: 'center',
				fontFamily: FONT_STACK,
				fontWeight: 700,
				fontSize: s,
				lineHeight: 1.22,
				letterSpacing: -0.3,
				color: '#fff',
				whiteSpace: 'pre-wrap',
				opacity,
			}}
		>
			<RichText
				text={text}
				textStyle={{
					WebkitTextStroke: `${Math.max(3, Math.round(s * 0.07))}px rgba(0,0,0,0.85)`,
					paintOrder: 'stroke fill',
					textShadow: '0 0 8px rgba(0,0,0,0.35)',
				}}
			/>
		</div>
	);
};

export const Remake: React.FC<RemakeProps> = (p) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const loopFrames = Math.max(1, Math.round(p.faceLoopSec * fps));
	const app = p.app;
	const appOpacity = app
		? app.fadeSec > 0
			? interpolate(t, [app.atSec, app.atSec + app.fadeSec], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
			: t >= app.atSec
				? 1
				: 0
		: 0;
	const appH = app ? app.width * p.appAspect : 0;
	return (
		<AbsoluteFill style={{backgroundColor: '#000'}}>
			<Loop durationInFrames={loopFrames}>
				<OffthreadVideo src={staticFile(p.face)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
			</Loop>
			<Audio src={staticFile(p.audio)} />
			{p.texts.map((x, i) => {
				const visible = t >= (x.from ?? 0) && t < (x.to ?? Infinity);
				return visible ? <NativeText key={i} text={x.text} y={x.y} size={x.size} /> : null;
			})}
			{app && appOpacity > 0 ? (
				<>
					{app.header ? <NativeText text={app.header} y={app.headerY} size={50} opacity={appOpacity} /> : null}
					<Img
						src={staticFile(app.image)}
						style={{
							position: 'absolute',
							left: (1080 - app.width) / 2,
							top: app.y - appH / 2,
							width: app.width,
							height: appH,
							borderRadius: 30,
							boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
							opacity: appOpacity,
						}}
					/>
				</>
			) : null}
		</AbsoluteFill>
	);
};
