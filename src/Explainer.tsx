import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CLASSIC_STACK, loadFonts, useFontsReady} from './fonts';

loadFonts();

// GoPeak animated explainer: faceless, light background, capsule figures with height bars.
// Format inspired by the top #heightprediction explainers; drawings, script and data are GoPeak's own.
// Heights in inches. Facts: mid-parental height (boys: (mom + dad + 5) / 2, ±4 in covers most kids),
// sleep 8–10 h (AASM), calcium 1,300 mg/day ages 9–18 (NIH ODS).

export type Person = {label: string; inches: number; color?: string; tag?: string};
export type ExplainerProps = {
	durationSec: number;
	audio: string | null;
	people: Person[]; // e.g. mom, dad, him
	title: string; // scene 1 headline
	sub: string; // scene 1 small line
	scenes: {at: number; label: string; text: string; show?: 'range' | 'past' | 'three' | 'cta'}[];
	rangeCenter: number; // inches, mid-parental
	three: {big: string; small: string}[];
	cta: {title: string; sub: string; image: string};
};

const BG = '#f3f1ec';
const INK = '#111114';
const BLUE = '#1f7fff';
const GROUND = 1460;
const PX = 9.2; // px per inch
const ftin = (n: number) => {
	const ft = Math.floor(n / 12), r = n - ft * 12, whole = Math.floor(r), half = r - whole >= 0.25 && r - whole < 0.75;
	return `${ft}’${half ? whole + '½' : Math.round(r)}”`;
};

const Figure: React.FC<{x: number; inches: number; color: string; grow: number}> = ({x, inches, color, grow}) => {
	const h = inches * PX * grow;
	const head = 74;
	const bodyH = Math.max(0, h - head - 10);
	return (
		<g transform={`translate(${x},${GROUND})`}>
			<ellipse cx={0} cy={4} rx={70} ry={10} fill="rgba(0,0,0,0.08)" />
			<rect x={-46} y={-bodyH} width={92} height={bodyH} rx={46} fill={color} />
			<circle cx={0} cy={-bodyH - 10 - head / 2} r={head / 2} fill={color} />
		</g>
	);
};

const Tag: React.FC<{x: number; y: number; text: string; dark?: boolean; s: number; fs?: number}> = ({x, y, text, dark, s, fs = 32}) => (
	<g transform={`translate(${x},${y}) scale(${s})`} opacity={s}>
		<rect x={-text.length * fs * 0.4 - 20} y={-fs * 0.95} width={text.length * fs * 0.8 + 40} height={fs * 1.75} rx={fs * 0.875} fill={dark ? INK : '#fff'} stroke={dark ? 'none' : 'rgba(0,0,0,0.12)'} strokeWidth={2} />
		<text x={0} y={10} textAnchor="middle" fontFamily={CLASSIC_STACK} fontWeight={600} fontSize={fs} fill={dark ? '#fff' : INK}>
			{text}
		</text>
	</g>
);

// Typewriter text: reveals characters over ~0.6 s.
const Typed: React.FC<{text: string; start: number; y: number; size: number; color?: string; weight?: number}> = ({text, start, y, size, color = INK, weight = 600}) => {
	const frame = useCurrentFrame();
	const n = Math.max(0, Math.min(text.length, Math.floor((frame - start) * 1.6)));
	return (
		<div style={{position: 'absolute', left: 110, right: 110, top: y, fontFamily: CLASSIC_STACK, fontWeight: weight, fontSize: size, lineHeight: 1.15, color, letterSpacing: -0.6, whiteSpace: 'pre-wrap'}}>
			{text.slice(0, n)}
			<span style={{opacity: 0}}>{text.slice(n)}</span>
		</div>
	);
};

export const Explainer: React.FC<ExplainerProps> = (p) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const ready = useFontsReady();
	const t = frame / fps;
	const scene = [...p.scenes].reverse().find((s) => t >= s.at) ?? p.scenes[0];
	const sFrame = Math.round((t - scene.at) * fps);
	const pop = (delay = 0) => spring({frame: sFrame - delay, fps, config: {damping: 14, stiffness: 170}});
	const grow = spring({frame, fps, config: {damping: 18, stiffness: 90}, durationInFrames: 40});
	const xs = p.people.map((_, i) => 640 + (i - (p.people.length - 1) / 2) * 210); // right of center: left side holds the range label
	const showFigs = scene.show !== 'three' && scene.show !== 'cta';
	const lo = p.rangeCenter - 4, hi = p.rangeCenter + 4;
	const yOf = (inches: number) => GROUND - inches * PX;
	if (!ready) return <AbsoluteFill style={{background: BG}} />;
	return (
		<AbsoluteFill style={{background: BG}}>
			{p.audio ? <Audio src={staticFile(p.audio)} volume={0.9} /> : null}
			{/* section label */}
			<div style={{position: 'absolute', left: 110, top: 300, display: 'flex', alignItems: 'center', gap: 12, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 26, letterSpacing: 3, color: 'rgba(0,0,0,0.45)', textTransform: 'uppercase'}}>
				<span style={{width: 12, height: 12, borderRadius: 6, background: BLUE}} />
				{scene.label}
			</div>
			{scene === p.scenes[0] ? (
				<>
					<div style={{position: 'absolute', left: 110, right: 110, top: 350, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 96, letterSpacing: -2, color: INK, transform: `scale(${0.9 + 0.1 * pop()})`, transformOrigin: 'left center'}}>
						{p.title}
					</div>
					<div style={{position: 'absolute', left: 110, top: 470, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 34, letterSpacing: 2, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', opacity: pop(8)}}>{p.sub}</div>
				</>
			) : scene.show !== 'cta' ? (
				<Typed text={scene.text} start={Math.round(scene.at * fps)} y={360} size={64} />
			) : null}

			{showFigs ? (
				<svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
					<line x1={60} x2={1020} y1={GROUND + 2} y2={GROUND + 2} stroke="rgba(0,0,0,0.15)" strokeWidth={3} />
					{scene.show === 'range' || scene.show === 'past' ? (
						<g opacity={pop()}>
							<rect x={70} width={940} y={yOf(hi)} height={(hi - lo) * PX} fill={BLUE} opacity={0.12} rx={14} />
							<line x1={70} x2={1010} y1={yOf(p.rangeCenter)} y2={yOf(p.rangeCenter)} stroke={BLUE} strokeWidth={4} strokeDasharray="14 12" />
							<Tag x={206} y={yOf(p.rangeCenter) + 8} text={`genes ${ftin(p.rangeCenter)}`} s={pop(6)} fs={23} />
						</g>
					) : null}
					{p.people.map((pp, i) => (
						<Figure key={i} x={xs[i]} inches={pp.inches} color={scene.show === 'past' && pp.tag ? BLUE : pp.color ?? '#9a9aa2'} grow={grow} />
					))}
					{p.people.map((pp, i) => (
						<React.Fragment key={'t' + i}>
							<Tag x={xs[i]} y={yOf(pp.inches) - 50} text={ftin(pp.inches)} s={Math.min(1, grow)} dark={!!pp.tag} />
							<text x={xs[i]} y={GROUND + 60} textAnchor="middle" fontFamily={CLASSIC_STACK} fontWeight={600} fontSize={30} letterSpacing={2} fill="rgba(0,0,0,0.5)">
								{pp.label.toUpperCase()}
							</text>
						</React.Fragment>
					))}
					{scene.show === 'past' ? (
						<Tag x={xs[p.people.findIndex((x) => x.tag)]} y={yOf(Math.max(...p.people.map((x) => x.inches))) - 130} text={p.people.find((x) => x.tag)?.tag ?? ''} dark s={pop(4)} />
					) : null}
				</svg>
			) : null}

			{scene.show === 'three' ? (
				<div style={{position: 'absolute', left: 110, right: 110, top: 640, display: 'grid', gap: 26}}>
					{p.three.map((c, i) => {
						const s = pop(i * 6);
						return (
							<div key={i} style={{background: '#fff', borderRadius: 36, padding: '34px 40px', boxShadow: '0 8px 0 rgba(0,0,0,0.06)', display: 'flex', alignItems: 'baseline', gap: 26, opacity: s, transform: `translateY(${(1 - s) * 40}px)`}}>
								<span style={{fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 84, color: BLUE, letterSpacing: -2}}>{c.big}</span>
								<span style={{fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 40, color: INK}}>{c.small}</span>
							</div>
						);
					})}
				</div>
			) : null}

			{scene.show === 'cta' ? (
				<>
					<div style={{position: 'absolute', left: 110, right: 110, top: 380, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 88, lineHeight: 1.05, letterSpacing: -2, color: INK, opacity: pop()}}>{p.cta.title}</div>
					<div style={{position: 'absolute', left: 110, right: 110, top: 600, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 40, color: 'rgba(0,0,0,0.55)', opacity: pop(6)}}>{p.cta.sub}</div>
					<Img
						src={staticFile(p.cta.image)}
						style={{position: 'absolute', left: 540 - 230, top: 760, width: 460, borderRadius: 40, boxShadow: '0 16px 0 rgba(0,0,0,0.08)', transform: `translateY(${(1 - pop(10)) * 60}px)`, opacity: pop(10)}}
					/>
				</>
			) : null}
			<div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 10, background: BLUE, transformOrigin: 'left', transform: `scaleX(${interpolate(t, [0, p.durationSec], [0, 1])})`}} />
		</AbsoluteFill>
	);
};
