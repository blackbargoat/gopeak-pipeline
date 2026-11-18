#!/usr/bin/env node
// Uploads rendered jobs (out/<job>/manifest.json) to Supabase so they show up in HQ for approval.
// Videos + covers go to the public 'pipe' bucket (Instagram fetches from there); rows go to pipe_clips / pipe_posts
// as status 'rendered' (waiting for approval). Needs SUPABASE_SERVICE_KEY in the environment (never commit it).
// Usage: SUPABASE_SERVICE_KEY=... node scripts/push-hq.mjs [job ...]
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = 'https://etdbjahwegsmuelcawgf.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('set SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = {apikey: KEY, Authorization: `Bearer ${KEY}`};
const FORMATS = new Set(['comment_bait', 'bait_peek', 'app_reveal', 'text_remake', 'talking', 'other']);
const TAGS = '#height #growthspurt #howtallwillibe #heightprediction #tall';
const CAPTION = {
	comment_bait: 'comment your age and height, i\'ll tell you how tall you\'ll get',
	bait_peek: 'comment your age and height for your prediction',
	app_reveal: 'your full height prediction is on gopeak, app in bio',
	screen_payoff: 'your full height prediction is on gopeak, app in bio',
	text_remake: 'send this to your short friend 😭 comment your age and height',
};

async function upload(file, key, type) {
	const r = await fetch(`${URL_}/storage/v1/object/pipe/${key}`, {method: 'POST', headers: {...H, 'content-type': type, 'x-upsert': 'true'}, body: fs.readFileSync(file)});
	if (!r.ok) throw new Error(`upload ${key}: ${r.status} ${await r.text()}`);
	return `${URL_}/storage/v1/object/public/pipe/${key}`;
}
async function rest(table, rows, onConflict) {
	const r = await fetch(`${URL_}/rest/v1/${table}?on_conflict=${onConflict}`, {method: 'POST', headers: {...H, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation'}, body: JSON.stringify(rows)});
	if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
	return r.json();
}
async function existing(source) {
	const r = await fetch(`${URL_}/rest/v1/pipe_clips?select=id&source_name=eq.${encodeURIComponent(source)}`, {headers: H});
	return (await r.json())[0]?.id;
}

const OUT = path.join(ROOT, 'out');
const jobs = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(OUT).filter((d) => fs.existsSync(path.join(OUT, d, 'manifest.json')));
for (const job of jobs) {
	const m = JSON.parse(fs.readFileSync(path.join(OUT, job, 'manifest.json'), 'utf8'));
	const source = `${job}/${path.basename(m.source)}`;
	let clipId = await existing(source);
	if (!clipId) [{id: clipId}] = await rest('pipe_clips', [{source_name: source, kind: 'other', status: 'ready', hooks: m.variants.map((v) => v.text.split('\n')[0].slice(0, 120))}], 'id');
	for (const v of m.variants) {
		const mp4 = path.join(ROOT, v.file), jpg = mp4.replace(/\.mp4$/, '.jpg');
		if (!fs.existsSync(jpg)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1.2', '-i', mp4, '-frames:v', '1', '-q:v', '3', jpg]);
		const video_url = await upload(mp4, `${job}/${v.id}.mp4`, 'video/mp4');
		const thumb_url = await upload(jpg, `${job}/${v.id}.jpg`, 'image/jpeg');
		const fmt = FORMATS.has(v.format) ? v.format : 'other';
		await rest('pipe_posts', [{clip_id: clipId, variant: v.id, account: v.account, platforms: ['instagram'], hook: v.text.slice(0, 200),
			music: v.sound?.name || null, video_url, thumb_url, format: fmt, trial: true, // every pipeline video starts as a trial reel
			caption: `${CAPTION[v.format] || CAPTION.comment_bait}\n\n${TAGS}`}], 'clip_id,variant');
		console.log(`  ${job} ${v.id} -> @${v.account}`);
	}
}
