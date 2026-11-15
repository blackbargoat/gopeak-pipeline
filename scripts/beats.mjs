// Beat/onset finder (no extra installs: ffmpeg decodes, plain JS does the math).
// Energy envelope in 23 ms hops → positive change in log-energy (onset strength) → peaks above
// mean + 1.2·std, at least 0.22 s apart. Good enough to land cuts on the hits of a sound.
import {execFileSync} from 'node:child_process';

const cache = new Map();

export function onsets(file) {
	if (cache.has(file)) return cache.get(file);
	const sr = 22050, hop = 512;
	const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], {maxBuffer: 1 << 28});
	const x = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
	const n = Math.floor(x.length / hop);
	const env = new Float64Array(n);
	for (let i = 0; i < n; i++) {
		let e = 0;
		for (let j = 0; j < hop; j++) {
			const v = x[i * hop + j];
			e += v * v;
		}
		env[i] = Math.log(1e-9 + e / hop);
	}
	const flux = new Float64Array(n);
	for (let i = 1; i < n; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
	const mean = flux.reduce((a, b) => a + b, 0) / n;
	const std = Math.sqrt(flux.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
	const th = mean + 1.2 * std, gap = Math.round((0.22 * sr) / hop);
	const out = [];
	for (let i = 2; i < n - 2; i++) {
		if (flux[i] > th && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] >= flux[i - 2] && flux[i] >= flux[i + 2]) {
			if (out.length && i - out[out.length - 1].i < gap) {
				if (flux[i] > out[out.length - 1].s) out[out.length - 1] = {i, s: flux[i]};
				continue;
			}
			out.push({i, s: flux[i]});
		}
	}
	const res = out.map((o) => ({t: +((o.i * hop) / sr).toFixed(3), s: o.s}));
	cache.set(file, res);
	return res;
}

// Strongest onset within ±win of t (falls back to t).
export function snap(file, t, win = 0.6, offset = 0) {
	const hits = onsets(file).filter((h) => Math.abs(h.t - offset - t) <= win);
	if (!hits.length) return t;
	return +(hits.sort((a, b) => b.s - a.s)[0].t - offset).toFixed(3);
}
