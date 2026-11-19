#!/usr/bin/env node
// Learns the content mix from real results, so the pipeline makes more of what works.
// Data: per-video Instagram stats the reply bot collects every 2 h (views, comments, shares, saves) for both accounts.
// Pipeline posts are matched exactly by permalink (pipe_posts.results, needs SUPABASE_SERVICE_KEY); older posts are
// classified by caption and count half.
// Output: learned.json {mix, stats, templates, audios}. remake.mjs uses learned.mix (when config.learn) and ranks the
// templates inside each format by their own results.
//
// Score per format = median views × (1 + comments per 1k / 20). Comments are weighted because the reply bot turns each
// comment into an "app in bio" reply. New mix = 50% your mix + 50% score share, every format kept >= 8% (new ideas still
// get tested), no format moves more than 20 points per run.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATS = 'https://raw.githubusercontent.com/blackbargoat/height-reply-bot/main/stats/posts.json';
const SB = 'https://etdbjahwegsmuelcawgf.supabase.co/rest/v1/';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const prev = fs.existsSync(path.join(ROOT, 'learned.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'learned.json'), 'utf8')) : null;
const norm = (u) => (u || '').replace(/\/+$/, '');

const byCaption = (c = '') => {
	const t = c.toLowerCase();
	if (t.includes('flex') || t.includes("i'll tell you how tall")) return 'comment_bait';
	if (t.includes('for your prediction')) return 'bait_peek';
	if (t.includes('predict') || t.includes('app in b')) return 'app_reveal';
	return 'text_remake';
};

// Exact matches: pipeline posts that went live (variant id ends with -ref<template>)
const exact = new Map();
if (KEY) {
	const r = await fetch(`${SB}pipe_posts?select=variant,format,music,results,account&status=eq.posted`, {headers: {apikey: KEY, Authorization: `Bearer ${KEY}`}});
	if (r.ok) for (const p of await r.json()) {
		const url = norm(p.results?.instagram?.url);
		if (url) exact.set(url, {format: p.format === 'other' ? 'screen_payoff' : p.format, template: p.variant.match(/-ref([^~]+)/)?.[1] ?? null, music: p.music});
	}
}

const posts = Object.values(await (await fetch(STATS)).json());
const groups = {}, templates = {}, audios = {};
for (const p of posts) {
	const hit = exact.get(norm(p.permalink));
	const f = hit?.format ?? byCaption(p.caption);
	const w = hit ? 1 : 0.5;
	const row = {views: p.views || 0, comments: p.comments || 0, w};
	(groups[f] ??= []).push(row);
	if (hit?.template) (templates[hit.template] ??= []).push(row);
	if (hit?.music) (audios[hit.music] ??= []).push(row);
}
const median = (a) => {
	const s = [...a].sort((x, y) => x - y);
	return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const summarize = (g) => {
	const tv = g.reduce((t, x) => t + x.views, 0);
	const cpk = tv ? (g.reduce((t, x) => t + x.comments, 0) / tv) * 1000 : 0;
	const views = median(g.map((x) => x.views));
	return {posts: g.length, weight: g.reduce((t, x) => t + x.w, 0), medianViews: views, bestViews: Math.max(0, ...g.map((x) => x.views)), commentsPer1k: +cpk.toFixed(1), score: Math.round(views * (1 + cpk / 20))};
};
const stats = {};
for (const f of Object.keys(cfg.mix)) {
	const s = summarize(groups[f] || []);
	stats[f] = {...s, score: s.weight >= 2 ? s.score : null};
}
const scored = Object.entries(stats).filter(([, s]) => s.score != null);
const total = scored.reduce((t, [, s]) => t + s.score, 0);
const base = prev?.mix || cfg.mix;
let mix = {};
for (const f of Object.keys(cfg.mix)) {
	const share = stats[f].score != null && total ? stats[f].score / total : cfg.mix[f];
	let v = 0.5 * cfg.mix[f] + 0.5 * share;
	const b0 = base[f] ?? cfg.mix[f];
	v = Math.max(b0 - 0.2, Math.min(b0 + 0.2, v));
	mix[f] = cfg.mix[f] === 0 ? 0 : Math.max(0.08, v);   // a format switched off in HQ stays off (owner 2026-11-19)
}
// owner rule 2026-11-19: the Flex format (comment_bait) is the proven winner -> never below 60% of the mix
if (cfg.mix.comment_bait) {
	const rest = Object.entries(mix).filter(([k]) => k !== 'comment_bait').reduce((t, [, v]) => t + v, 0);
	mix.comment_bait = Math.max(mix.comment_bait, 1.5 * rest);   // cb / (cb + rest) >= 60%
}
const sum = Object.values(mix).reduce((a, b) => a + b, 0);
mix = Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, +(v / sum).toFixed(3)]));
const out = {
	mix,
	stats,
	templates: Object.fromEntries(Object.entries(templates).map(([k, v]) => [k, summarize(v)])),
	audios: Object.fromEntries(Object.entries(audios).map(([k, v]) => [k, summarize(v)])),
	basis: `${posts.length} videos (${[...exact.keys()].filter((u) => posts.some((p) => norm(p.permalink) === u)).length} pipeline posts matched exactly, rest by caption)`,
	updatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(ROOT, 'learned.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({mix: out.mix, basis: out.basis, templates: out.templates}, null, 1));
