import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, Loop, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
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
	pop?: boolean; // springs in (small card peek) instead of a hard cut
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
	// Per-use variation so each trial reel of the same clip is its own file (mirror, crop, speed, grade).
	// App screen recordings shown as a phone-sized card over the dimmed face (screen payoff format).
	screens?: {src: string; from: number; to: number; header?: string | null; headerY?: number; headerW?: number; size?: number; width?: number; y?: number}[];
	mirror?: boolean;
	zoom?: number; // 1.00-1.08
	rate?: number; // 0.96-1.04
	shiftX?: number; // px, crop offset
	grade?: {brightness: number; contrast: number; saturate: number};
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

const NativeText: React.FC<{text: string; y: number; w: number; linePx: number; opacity?: number; size?: number}> = ({
	text,
	y,
	w,
	linePx,
	opacity = 1,
	size,
}) => {
	const fontsReady = useFontsReady();
	if (!fontsReady) return null;
	const s = size ?? sizeForWidth(text, w);
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
	const rate = p.rate ?? 1;
	const loopFrames = Math.max(1, Math.round((p.faceLoopSec / rate) * fps));
	const g = p.grade ?? {brightness: 1, contrast: 1, saturate: 1};
	const faceStyle: React.CSSProperties = {
		width: '100%',
		height: '100%',
		objectFit: 'cover',
		transform: `translateX(${p.shiftX ?? 0}px) scale(${(p.mirror ? -1 : 1) * (p.zoom ?? 1)}, ${p.zoom ?? 1})`,
		filter: `brightness(${g.brightness}) contrast(${g.contrast}) saturate(${g.saturate})`,
	};
	const app = p.app;
	const appOpacity = app
		? app.fadeSec > 0
			? interpolate(t, [app.atSec, app.atSec + app.fadeSec], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
			: t >= app.atSec
				? 1
				: 0
		: 0;
	const appH = app ? app.width * p.appAspect : 0;
	const popS = app?.pop && t >= app.atSec ? spring({frame: frame - Math.round(app.atSec * fps), fps, config: {damping: 13, stiffness: 190}}) : 1;
	return (
		<AbsoluteFill style={{backgroundColor: '#000'}}>
			<Loop durationInFrames={loopFrames}>
				<OffthreadVideo src={staticFile(p.face)} muted playbackRate={rate} style={faceStyle} />
			</Loop>
			<Audio src={staticFile(p.audio)} />
			{(p.screens ?? []).map((sc, i) => {
				const w = sc.width ?? 560;
				const h = (w * 2868) / 1320;
				const cy = sc.y ?? 1040;
				const from = Math.round(sc.from * fps);
				const dur = Math.max(1, Math.round((sc.to - sc.from) * fps));
				return (
					<Sequence key={i} from={from} durationInFrames={dur} layout="none">
						<AbsoluteFill style={{background: 'rgba(0,0,0,0.5)'}} />
						<div
							style={{
								position: 'absolute',
								left: (1080 - w) / 2,
								top: cy - h / 2,
								width: w,
								height: h,
								borderRadius: 54,
								overflow: 'hidden',
								boxShadow: '0 0 0 6px #111, 0 30px 60px rgba(0,0,0,0.6)',
							}}
						>
							<OffthreadVideo src={staticFile(sc.src)} muted style={{width: '100%', height: '100%', objectFit: 'cover'}} />
						</div>
						{sc.header ? <NativeText text={sc.header} y={sc.headerY ?? 330} w={sc.headerW ?? 600} linePx={78} size={sc.size ?? 64} /> : null}
					</Sequence>
				);
			})}
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
							transform: `scale(${0.82 + 0.18 * popS})`,
						}}
					/>
				</>
			) : null}
		</AbsoluteFill>
	);
};
