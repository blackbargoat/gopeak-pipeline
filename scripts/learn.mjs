#!/usr/bin/env node
// Learns the content mix from real results.
// Input: per-video stats the reply bot collects for both accounts (views, comments, shares, saves).
// Pipeline posts are matched by permalink once the worker records them (pipe_posts.results); older posts are
// classified by caption, which is rougher, so they count half.
// Output: learned.json {mix, stats, updatedAt}. remake.mjs uses learned.mix when config.learn is true.
//
// Score per format = median views × (1 + comments per 1k / 20). Comments are weighted because the reply bot
// turns each comment into an app link. New mix = 50% user mix + 50% score share, every format kept ≥ 10%
// (so new ideas still get tested), and no format moves more than 15 points per run.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATS = 'https://raw.githubusercontent.com/blackbargoat/height-reply-bot/main/stats/posts.json';
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const prev = fs.existsSync(path.join(ROOT, 'learned.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'learned.json'), 'utf8')) : null;

const byCaption = (c = '') => {
	const t = c.toLowerCase();
	if (t.includes('flex')) return 'comment_bait';
	if (t.includes('predict')) return 'app_reveal';
	return 'text_remake';
};

// pipeline posts with exact format, if the worker has written them
const exact = new Map();
const pipeFile = path.join(ROOT, 'out', 'posted.json'); // [{permalink, format, template}]
if (fs.existsSync(pipeFile)) for (const p of JSON.parse(fs.readFileSync(pipeFile, 'utf8'))) exact.set(p.permalink, p);

const posts = Object.values(await (await fetch(STATS)).json());
const groups = {};
const templates = {};
for (const p of posts) {
	const hit = exact.get(p.permalink);
	const f = hit?.format ?? byCaption(p.caption);
	const w = hit ? 1 : 0.5;
	(groups[f] ??= []).push({views: p.views || 0, comments: p.comments || 0, w});
	if (hit?.template) (templates[hit.template] ??= []).push(p.views || 0);
}
const median = (a) => {
	const s = [...a].sort((x, y) => x - y);
	return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const stats = {};
for (const f of Object.keys(cfg.mix)) {
	const g = groups[f] || [];
	const views = median(g.map((x) => x.views));
	const tv = g.reduce((t, x) => t + x.views, 0);
	const cpk = tv ? (g.reduce((t, x) => t + x.comments, 0) / tv) * 1000 : 0;
	const n = g.reduce((t, x) => t + x.w, 0);
	stats[f] = {posts: g.length, weight: n, medianViews: views, commentsPer1k: +cpk.toFixed(1), score: n >= 2 ? views * (1 + cpk / 20) : null};
}
const scored = Object.entries(stats).filter(([, s]) => s.score != null);
const total = scored.reduce((t, [, s]) => t + s.score, 0);
const base = prev?.mix || cfg.mix;
let mix = {};
for (const f of Object.keys(cfg.mix)) {
	const share = stats[f].score != null && total ? stats[f].score / total : cfg.mix[f];
	let v = 0.5 * cfg.mix[f] + 0.5 * share;
	v = Math.max(base[f] - 0.15, Math.min(base[f] + 0.15, v));
	mix[f] = Math.max(0.1, v);
}
const sum = Object.values(mix).reduce((a, b) => a + b, 0);
mix = Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, +(v / sum).toFixed(3)]));
const out = {
	mix,
	stats,
	templates: Object.fromEntries(Object.entries(templates).map(([k, v]) => [k, {posts: v.length, medianViews: median(v)}])),
	basis: `${posts.length} videos (${exact.size} matched exactly, rest by caption)`,
	updatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(ROOT, 'learned.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
