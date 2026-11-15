// Variation engine: makes each reuse of one clip its own upload (for trial reels).
// Use 0 is always the untouched reference recreation; later uses change footage, audio and caption a little.

const PRESETS = [
	{mirror: false, zoom: 1.0, rate: 1.0, shiftX: 0, grade: {brightness: 1, contrast: 1, saturate: 1}},
	{mirror: true, zoom: 1.04, rate: 1.02, shiftX: -18, grade: {brightness: 1.04, contrast: 1.05, saturate: 1.08}},
	{mirror: false, zoom: 1.07, rate: 0.98, shiftX: 24, grade: {brightness: 0.97, contrast: 1.06, saturate: 0.94}},
	{mirror: true, zoom: 1.02, rate: 1.03, shiftX: 12, grade: {brightness: 1.02, contrast: 0.97, saturate: 1.1}},
	{mirror: false, zoom: 1.05, rate: 0.97, shiftX: -26, grade: {brightness: 1.0, contrast: 1.08, saturate: 1.0}},
	{mirror: true, zoom: 1.08, rate: 1.01, shiftX: 0, grade: {brightness: 0.98, contrast: 1.02, saturate: 1.12}},
	{mirror: false, zoom: 1.03, rate: 1.04, shiftX: 16, grade: {brightness: 1.05, contrast: 0.98, saturate: 0.96}},
	{mirror: true, zoom: 1.06, rate: 0.99, shiftX: -10, grade: {brightness: 1.01, contrast: 1.04, saturate: 1.04}},
];

export const DEFAULT_VARY = {mirror: true, crop: true, speed: true, grade: true, audio: true, caption: true};

export function footage(i, opts = DEFAULT_VARY) {
	const p = PRESETS[i % PRESETS.length];
	return {
		mirror: opts.mirror ? p.mirror : false,
		zoom: opts.crop ? p.zoom : 1,
		shiftX: opts.crop ? p.shiftX : 0,
		rate: opts.speed ? p.rate : 1,
		grade: opts.grade ? p.grade : PRESETS[0].grade,
	};
}

// Small caption changes that keep the meaning: arrow emoji, the comment line, punctuation, capitalization.
const SWAPS = [
	[/⬇️/g, '👇'],
	[/Comment below/g, 'Comment yours'],
	[/Comment your height/g, 'Drop your height'],
	[/\?(\s|$)/, '??$1'],
	[/\.\.\./g, '…'],
];
export function caption(text, i, opts = DEFAULT_VARY, alts = []) {
	if (i === 0 || !opts.caption) return text;
	if (alts[i - 1]) return alts[i - 1];
	let out = text;
	const order = [...SWAPS.slice(i % SWAPS.length), ...SWAPS.slice(0, i % SWAPS.length)];
	for (const [re, to] of order) {
		const next = out.replace(re, to);
		if (next !== out) {
			out = next;
			break;
		}
	}
	if (out === text) {
		// fallback: toggle the period at the end of the first line, then the case of its first letter
		const [first, ...rest] = text.split('\n');
		const f = /[.!]$/.test(first) ? first.slice(0, -1) : i % 2 ? first + '.' : first[0] === first[0].toUpperCase() ? first[0].toLowerCase() + first.slice(1) : first[0].toUpperCase() + first.slice(1);
		out = [f, ...rest].join('\n');
	}
	return out;
}

export function audio(template, i, pool, opts = DEFAULT_VARY) {
	if (i === 0 || !opts.audio) return template.audio;
	const others = pool.filter((a) => a !== template.audio);
	return others.length ? others[(i - 1) % others.length] : template.audio;
}
