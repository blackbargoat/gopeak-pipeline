import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Loop, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {measureText} from '@remotion/layout-utils';
import {CLASSIC_FONT, CLASSIC_STACK, loadFonts, useFontsReady} from './fonts';
import {RichText} from './RichText';

loadFonts();

// Recreates a reference outlier 1:1 with Mav's face clip: TikTok's native text look
// (TikTok Sans, white, thin dark outline), same text/positions/timing/audio, GoPeak screen as the payoff.
export type RemakeText = {text: string; y: number; w: number; linePx: number; from?: number; to?: number};
export type RemakeApp = {
	image: string;
	atSec: number;
	fadeSec: number;
	header: string | null;
	headerY: number;
	headerW?: number;
	headerLinePx?: number;
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

// CapCut default text: Proxima Nova Semibold, white, solid black stroke, no glow.
// Total stroke width; half of it shows outside the letters (paint-order: stroke first).
const STROKE = 0.16;
// CapCut sets Classic text tighter than the font's default spacing.
const TRACK = -0.035; // em

// Font size that makes the widest line (emoji excluded) exactly `w` px wide, as measured on the reference.
const sizeForWidth = (text: string, w: number) => {
	const lines = text
		.replace(/\p{Extended_Pictographic}|️/gu, '')
		.split('\n')
		.filter((l) => l.trim());
	const per100 = Math.max(
		...lines.map(
			(l) =>
				measureText({text: l.trim(), fontFamily: CLASSIC_FONT, fontSize: 100, fontWeight: '600', letterSpacing: `${TRACK * 100}px`})
					.width,
		),
	);
	return w / (per100 / 100 + STROKE);
};

const NativeText: React.FC<{text: string; y: number; w: number; linePx: number; opacity?: number}> = ({
	text,
	y,
	w,
	linePx,
	opacity = 1,
}) => {
	const fontsReady = useFontsReady();
	if (!fontsReady) return null;
	const s = sizeForWidth(text, w);
	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				width: 1080,
				top: y,
				transform: 'translateY(-50%)',
				textAlign: 'center',
				fontFamily: CLASSIC_STACK,
				fontWeight: 600,
				fontSize: s,
				lineHeight: `${linePx}px`,
				letterSpacing: `${TRACK}em`,
				color: '#fff',
				whiteSpace: 'pre',
				opacity,
			}}
		>
			<RichText text={text} textStyle={{WebkitTextStroke: `${s * STROKE}px #000`, paintOrder: 'stroke fill'}} />
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
				return visible ? <NativeText key={i} text={x.text} y={x.y} w={x.w} linePx={x.linePx} /> : null;
			})}
			{app && appOpacity > 0 ? (
				<>
					{app.header ? (
						<NativeText
							text={app.header}
							y={app.headerY}
							w={app.headerW ?? 600}
							linePx={app.headerLinePx ?? 70}
							opacity={appOpacity}
						/>
					) : null}
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
