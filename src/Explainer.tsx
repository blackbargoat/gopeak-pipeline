import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {CLASSIC_STACK, loadFonts, useFontsReady} from './fonts';

loadFonts();

// GoPeak animated explainer (v2): faceless, paper background, simple people with a height ruler.
// The format (scene-by-scene height story ending in "comment your age") is common in the niche;
// the figures, wording, colors and data here are GoPeak's own.
// Facts used: mid-parental height for boys = (mom + dad + 5 in) / 2, most kids land within ±4 in;
// average NBA player ≈ 6'6"; sleep 8–10 h (AASM); calcium 1,300 mg/day ages 9–18 (NIH ODS);
// protein RDA 52 g/day boys 14–18 (NIH).

export type Person = {label: string; inches: number; color?: string; key?: boolean};
export type Scene = {at: number; label: string; text: string; show?: 'range' | 'past' | 'compare' | 'three' | 'cta'};
export type ExplainerProps = {
	durationSec: number;
	audio: string | null;
	people: Person[];
	compare?: Person; // extra figure for the "for scale" beat
	title: string;
	sub: string;
	scenes: Scene[];
	rangeCenter: number;
	stamp: string; // stamp on the key figure in the "past" beat
	three: {big: string; small: string}[];
	cta: {title: string; sub: string; typed: string; image: string};
};

const BG = '#f4f2ed';
const INK = '#141416';
const GREY = '#a9a9b0';
const BLUE = '#1f7fff';
const CORAL = '#ff5a4e';
const GROUND = 1450;
const PX = 8.6;
const ftin = (n: number) => {
	const ft = Math.floor(n / 12), r = n - ft * 12, whole = Math.floor(r), half = r - whole >= 0.25 && r - whole < 0.75;
	return `${ft}’${half ? whole + '½' : Math.round(r)}”`;
};

// A plain person: round head, rounded torso, two legs, two arms, colored shoes. No face.
const Figure: React.FC<{x: number; inches: number; color: string; grow: number; shoe?: string}> = ({x, inches, color, grow, shoe = CORAL}) => {
	const h = inches * PX * grow;
	const head = h * 0.13, legs = h * 0.44, torso = h - head - legs - 8;
	const w = Math.max(40, inches * 1.05);
	return (
		<g transform={`translate(${x},${GROUND})`}>
			<ellipse cx={0} cy={6} rx={w * 0.9} ry={10} fill="rgba(0,0,0,0.07)" />
			{/* legs */}
			<rect x={-w * 0.36} y={-legs} width={w * 0.3} height={legs} rx={w * 0.15} fill={color} />
			<rect x={w * 0.06} y={-legs} width={w * 0.3} height={legs} rx={w * 0.15} fill={color} />
			<rect x={-w * 0.42} y={-10} width={w * 0.38} height={14} rx={7} fill={shoe} />
			<rect x={w * 0.04} y={-10} width={w * 0.38} height={14} rx={7} fill={shoe} />
			{/* torso + arms */}
			<rect x={-w / 2} y={-legs - torso + 6} width={w} height={torso} rx={w * 0.32} fill={color} />
			<rect x={-w / 2 - w * 0.22} y={-legs - torso + 16} width={w * 0.2} height={torso * 0.92} rx={w * 0.1} fill={color} />
			<rect x={w / 2 + w * 0.02} y={-legs - torso + 16} width={w * 0.2} height={torso * 0.92} rx={w * 0.1} fill={color} />
			{/* head */}
			<circle cx={0} cy={-legs - torso - head / 2} r={head / 2} fill={color} />
		</g>
	);
};

// Rounded tag with a small pointer down to the head it labels.
const Tag: React.FC<{x: number; y: number; text: string; dark?: boolean; s: number; fs?: number; pointer?: boolean}> = ({x, y, text, dark, s, fs = 30, pointer = true}) => {
	const w = text.length * fs * 0.56 + 36, h = fs * 1.7, fill = dark ? INK : '#fff';
	return (
		<g transform={`translate(${x},${y}) scale(${s})`} opacity={Math.min(1, s)}>
			<rect x={-w / 2} y={-h} width={w} height={h} rx={12} fill={fill} stroke={dark ? 'none' : 'rgba(0,0,0,0.1)'} strokeWidth={2} />
			{pointer ? <path d={`M -10 0 L 10 0 L 0 12 Z`} fill={fill} /> : null}
			<text x={0} y={-h / 2 + fs * 0.36} textAnchor="middle" fontFamily={CLASSIC_STACK} fontWeight={600} fontSize={fs} fill={dark ? '#fff' : INK}>
				{text}
			</text>
		</g>
	);
};

// Height ruler on the left: tick per inch, label every 6 in from 4'0" to 7'0".
const Ruler: React.FC<{s: number}> = ({s}) => (
	<g opacity={s}>
		<line x1={120} x2={120} y1={GROUND} y2={GROUND - 84 * PX} stroke="rgba(0,0,0,0.25)" strokeWidth={2} />
		{Array.from({length: 37}, (_, i) => 48 + i).map((inch) => {
			const y = GROUND - inch * PX, major = inch % 6 === 0;
			return (
				<g key={inch}>
					<line x1={120} x2={major ? 150 : 134} y1={y} y2={y} stroke="rgba(0,0,0,0.3)" strokeWidth={major ? 2.5 : 1.5} />
					{major ? (
						<text x={160} y={y + 9} fontFamily={CLASSIC_STACK} fontWeight={600} fontSize={24} fill="rgba(0,0,0,0.45)">
							{ftin(inch)}
						</text>
					) : null}
				</g>
			);
		})}
	</g>
);

const Typed: React.FC<{text: string; start: number; y: number; size: number}> = ({text, start, y, size}) => {
	const frame = useCurrentFrame();
	const n = Math.max(0, Math.min(text.length, Math.floor((frame - start) * 1.8)));
	return (
		<div style={{position: 'absolute', left: 110, right: 110, top: y, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: size, lineHeight: 1.15, color: INK, letterSpacing: -0.8, whiteSpace: 'pre-wrap'}}>
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
	const idx = p.scenes.reduce((a, s, i) => (t >= s.at ? i : a), 0);
	const scene = p.scenes[idx];
	const sFrame = Math.round((t - scene.at) * fps);
	const pop = (delay = 0) => spring({frame: sFrame - delay, fps, config: {damping: 14, stiffness: 170}});
	const grow = spring({frame, fps, config: {damping: 18, stiffness: 90}, durationInFrames: 40});
	if (!ready) return <AbsoluteFill style={{background: BG}} />;

	const cast = scene.show === 'compare' && p.compare ? [...p.people, p.compare] : p.people;
	const span = cast.length > 3 ? 175 : 205;
	const xs = cast.map((_, i) => 640 + (i - (cast.length - 1) / 2) * span);
	const keyIdx = cast.findIndex((c) => c.key);
	const showFigs = scene.show !== 'three' && scene.show !== 'cta';
	const lo = p.rangeCenter - 4, hi = p.rangeCenter + 4;
	const yOf = (inches: number) => GROUND - inches * PX;
	// slow push-in on the key figure during the twist
	const zoom = scene.show === 'past' ? interpolate(sFrame, [0, 3.5 * fps], [1, 1.12], {extrapolateRight: 'clamp'}) : 1;
	const zx = keyIdx >= 0 ? xs[keyIdx] : 540, zy = keyIdx >= 0 ? yOf(cast[keyIdx].inches) : GROUND;

	return (
		<AbsoluteFill style={{background: BG}}>
			{p.audio ? <Audio src={staticFile(p.audio)} volume={0.9} /> : null}
			<div style={{position: 'absolute', left: 110, top: 290, display: 'flex', alignItems: 'center', gap: 12, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 24, letterSpacing: 3.5, color: 'rgba(0,0,0,0.45)', textTransform: 'uppercase'}}>
				<span style={{width: 12, height: 12, borderRadius: 3, background: CORAL}} />
				{scene.label}
			</div>
			{idx === 0 ? (
				<>
					<div style={{position: 'absolute', left: 110, right: 110, top: 335, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 100, letterSpacing: -2.5, lineHeight: 1, color: INK, transform: `scale(${0.92 + 0.08 * pop()})`, transformOrigin: 'left center'}}>
						{p.title}
					</div>
					<div style={{position: 'absolute', left: 110, top: 455, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 32, letterSpacing: 2.5, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', opacity: pop(8)}}>{p.sub}</div>
				</>
			) : scene.show !== 'cta' ? (
				<Typed text={scene.text} start={Math.round(scene.at * fps)} y={340} size={62} />
			) : null}

			{showFigs ? (
				<svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
					<g transform={`translate(${zx},${zy}) scale(${zoom}) translate(${-zx},${-zy})`}>
						<Ruler s={Math.min(1, grow)} />
						<line x1={110} x2={1010} y1={GROUND + 2} y2={GROUND + 2} stroke="rgba(0,0,0,0.2)" strokeWidth={3} />
						{scene.show === 'range' || scene.show === 'past' || scene.show === 'compare' ? (
							<g opacity={Math.min(1, pop())}>
								<rect x={200} width={810} y={yOf(hi)} height={(hi - lo) * PX} fill={BLUE} opacity={0.1} />
								<line x1={200} x2={1010} y1={yOf(p.rangeCenter)} y2={yOf(p.rangeCenter)} stroke={BLUE} strokeWidth={4} strokeDasharray="16 12" />
								<text x={214} y={yOf(p.rangeCenter) - 14} fontFamily={CLASSIC_STACK} fontWeight={600} fontSize={26} letterSpacing={1.5} fill={BLUE}>
									{`GENES ${ftin(p.rangeCenter)}`}
								</text>
							</g>
						) : null}
						{cast.map((c, i) => (
							<Figure key={i} x={xs[i]} inches={c.inches} grow={c === p.compare ? Math.min(1, pop()) : grow} color={scene.show === 'past' && c.key ? BLUE : c.color ?? GREY} />
						))}
						{cast.map((c, i) => (
							<React.Fragment key={'t' + i}>
								<Tag x={xs[i]} y={yOf(c.inches) - 16} text={ftin(c.inches)} s={c === p.compare ? pop(4) : Math.min(1, grow)} dark={!!c.key} />
								<text x={xs[i]} y={GROUND + 58} textAnchor="middle" fontFamily={CLASSIC_STACK} fontWeight={600} fontSize={26} letterSpacing={2} fill="rgba(0,0,0,0.5)">
									{c.label.toUpperCase()}
								</text>
							</React.Fragment>
						))}
					</g>
					{scene.show === 'past' && keyIdx >= 0 ? (
						<g transform={`translate(${Math.min(820, xs[keyIdx])},${yOf(cast[keyIdx].inches) - 150}) rotate(-6) scale(${1.3 - 0.3 * Math.min(1, pop(6))})`} opacity={Math.min(1, pop(6))}>
							<rect x={-p.stamp.length * 12 - 22} y={-36} width={p.stamp.length * 24 + 44} height={64} rx={8} fill="none" stroke={CORAL} strokeWidth={5} />
							<text x={0} y={10} textAnchor="middle" fontFamily={CLASSIC_STACK} fontWeight={600} fontSize={34} letterSpacing={2} fill={CORAL}>
								{p.stamp.toUpperCase()}
							</text>
						</g>
					) : null}
				</svg>
			) : null}

			{scene.show === 'three' ? (
				<div style={{position: 'absolute', left: 110, right: 110, top: 600, display: 'grid', gap: 24}}>
					{p.three.map((c, i) => {
						const s = Math.min(1, pop(i * 7));
						return (
							<div key={i} style={{background: '#fff', borderRadius: 28, padding: '30px 36px', border: '2px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 26, opacity: s, transform: `translateY(${(1 - s) * 40}px)`}}>
								<span style={{width: 56, height: 56, borderRadius: 14, background: INK, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 30}}>{i + 1}</span>
								<span style={{fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 70, color: INK, letterSpacing: -2}}>{c.big}</span>
								<span style={{fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 34, color: 'rgba(0,0,0,0.55)'}}>{c.small}</span>
							</div>
						);
					})}
				</div>
			) : null}

			{scene.show === 'cta' ? (
				<>
					<div style={{position: 'absolute', left: 110, right: 110, top: 340, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 84, lineHeight: 1.04, letterSpacing: -2, color: INK, opacity: Math.min(1, pop())}}>{p.cta.title}</div>
					<div style={{position: 'absolute', left: 110, right: 110, top: 540, fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 38, color: 'rgba(0,0,0,0.55)', opacity: Math.min(1, pop(6))}}>{p.cta.sub}</div>
					{/* comment box being typed into */}
					<div style={{position: 'absolute', left: 110, right: 110, top: 640, height: 110, borderRadius: 22, background: '#fff', border: '3px solid rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', padding: '0 34px', fontFamily: CLASSIC_STACK, fontWeight: 600, fontSize: 46, color: INK, opacity: Math.min(1, pop(10))}}>
						{p.cta.typed.slice(0, Math.max(0, Math.floor((sFrame - 16) / 3)))}
						<span style={{width: 4, height: 54, background: BLUE, marginLeft: 6, opacity: Math.floor(sFrame / 15) % 2 ? 1 : 0}} />
					</div>
					<Img src={staticFile(p.cta.image)} style={{position: 'absolute', left: 540 - 210, top: 820, width: 420, borderRadius: 36, border: '2px solid rgba(0,0,0,0.08)', opacity: Math.min(1, pop(34)), transform: `translateY(${(1 - Math.min(1, pop(34))) * 50}px)`}} />
				</>
			) : null}
			<div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 8, background: CORAL, transformOrigin: 'left', transform: `scaleX(${interpolate(t, [0, p.durationSec], [0, 1])})`}} />
		</AbsoluteFill>
	);
};
