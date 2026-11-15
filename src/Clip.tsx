import React, {useMemo} from 'react';
import {
	AbsoluteFill,
	Audio,
	interpolate,
	OffthreadVideo,
	Sequence,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {createTikTokStyleCaptions, type Caption} from '@remotion/captions';
import {FONT_STACK, loadFonts} from './fonts';
import {RichText} from './RichText';
import {CAPTION_CENTER_Y, CAPTION_MAX_WIDTH, SAFE} from './safe';

loadFonts();

export type ClipProps = {
	video: string; // path inside public/, e.g. "jobs/abc/cut.mp4"
	durationSec: number;
	captions: Caption[];
	hook: string;
	hookSec: number; // how long the hook stays on screen (0 = whole video)
	music: string | null; // path inside public/
	musicVolume: number;
	musicStartSec: number;
	zoom: number; // small per-variant crop difference so reposts aren't pixel-identical
	accent: string; // highlight color for the active caption word
	cta: string | null; // end card text, e.g. "Free height prediction 👉 link in bio"
	ctaSec: number;
};

const outline = (px: number): React.CSSProperties => ({
	WebkitTextStroke: `${px}px #000`,
	paintOrder: 'stroke fill',
});

// Shrinks the hook so it never needs more than ~3 lines inside the safe width.
const hookSize = (text: string) => {
	const n = [...text].length;
	if (n <= 18) return 96;
	if (n <= 34) return 84;
	if (n <= 60) return 72;
	if (n <= 90) return 62;
	return 52;
};

const Hook: React.FC<{text: string}> = ({text}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame, fps, config: {damping: 14, stiffness: 180}});
	const size = hookSize(text);
	return (
		<div
			style={{
				position: 'absolute',
				top: SAFE.top + 20,
				left: SAFE.left,
				width: SAFE.width,
				textAlign: 'center',
				fontFamily: FONT_STACK,
				fontWeight: 900,
				fontSize: size,
				lineHeight: 1.12,
				color: '#fff',
				transform: `scale(${0.85 + 0.15 * s})`,
				opacity: s,
				whiteSpace: 'pre-wrap',
				textWrap: 'balance',
			}}
		>
			<RichText text={text} textStyle={outline(Math.round(size * 0.16))} />
		</div>
	);
};

const Captions: React.FC<{captions: Caption[]; accent: string}> = ({captions, accent}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const ms = (frame / fps) * 1000;
	const {pages} = useMemo(
		() => createTikTokStyleCaptions({captions, combineTokensWithinMilliseconds: 500}),
		[captions],
	);
	const page = pages.find((p, i) => {
		const end = pages[i + 1]?.startMs ?? p.startMs + p.durationMs;
		return ms >= p.startMs && ms < Math.min(end, p.startMs + p.durationMs + 400);
	});
	if (!page) return null;
	const pageFrame = Math.round(((ms - page.startMs) / 1000) * fps);
	const pop = spring({frame: pageFrame, fps, config: {damping: 12, stiffness: 260}, durationInFrames: 8});
	return (
		<div
			style={{
				position: 'absolute',
				left: (1080 - CAPTION_MAX_WIDTH) / 2,
				width: CAPTION_MAX_WIDTH,
				top: CAPTION_CENTER_Y - 120,
				height: 240,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				textAlign: 'center',
				fontFamily: FONT_STACK,
				fontWeight: 900,
				fontSize: 78,
				lineHeight: 1.1,
				transform: `scale(${0.8 + 0.2 * pop})`,
			}}
		>
			<div>
				{page.tokens.map((t, i) => {
					const active = ms >= t.fromMs && ms < t.toMs;
					return (
						<RichText
							key={i}
							text={t.text}
							textStyle={{...outline(13), color: active ? accent : '#fff'}}
						/>
					);
				})}
			</div>
		</div>
	);
};

const Cta: React.FC<{text: string}> = ({text}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame, fps, config: {damping: 13, stiffness: 160}});
	return (
		<div
			style={{
				position: 'absolute',
				left: SAFE.left + 40,
				width: SAFE.width - 160, // keeps clear of TikTok's right-side buttons
				top: 820,
				display: 'flex',
				justifyContent: 'center',
				transform: `translateY(${(1 - s) * 60}px) scale(${0.9 + 0.1 * s})`,
				opacity: s,
			}}
		>
			<div
				style={{
					background: '#fff',
					color: '#000',
					borderRadius: 34,
					padding: '26px 38px',
					fontFamily: FONT_STACK,
					fontWeight: 900,
					fontSize: 54,
					lineHeight: 1.15,
					textAlign: 'center',
					boxShadow: '0 14px 40px rgba(0,0,0,0.45)',
				}}
			>
				<RichText text={text} textStyle={{}} />
			</div>
		</div>
	);
};

export const Clip: React.FC<ClipProps> = (p) => {
	const {fps, durationInFrames} = useVideoConfig();
	const frame = useCurrentFrame();
	const hookFrames = p.hookSec > 0 ? Math.round(p.hookSec * fps) : durationInFrames;
	const ctaFrames = p.cta ? Math.min(Math.round(p.ctaSec * fps), durationInFrames) : 0;
	const drift = interpolate(frame, [0, durationInFrames], [p.zoom, p.zoom + 0.03]);
	return (
		<AbsoluteFill style={{backgroundColor: '#000'}}>
			<AbsoluteFill style={{transform: `scale(${drift})`}}>
				<OffthreadVideo src={staticFile(p.video)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
			</AbsoluteFill>
			{p.music ? (
				<Audio
					src={staticFile(p.music)}
					volume={(f) =>
						interpolate(f, [0, 10, durationInFrames - 15, durationInFrames], [0, p.musicVolume, p.musicVolume, 0], {
							extrapolateRight: 'clamp',
						})
					}
					trimBefore={Math.round(p.musicStartSec * fps)}
					loop
				/>
			) : null}
			<Captions captions={p.captions} accent={p.accent} />
			<Sequence durationInFrames={hookFrames}>
				<Hook text={p.hook} />
			</Sequence>
			{p.cta ? (
				<Sequence from={durationInFrames - ctaFrames}>
					<Cta text={p.cta} />
				</Sequence>
			) : null}
		</AbsoluteFill>
	);
};
