#!/usr/bin/env node
// Cloud worker: clips uploaded in HQ -> edited variants waiting for approval in HQ.
// Runs in GitHub Actions (.github/workflows/worker.yml) or on any machine with Node + ffmpeg.
//   SUPABASE_SERVICE_KEY=... node scripts/worker.mjs [--max 3]
// 1. claims the oldest 'queued' clip (pipe_clips), 2. joins its parts from the private bucket pipe-inbox,
// 3. runs remake.mjs (wants = template ids or format names from the upload sheet), 4. uploads the variants
// with push-hq.mjs, 5. marks the clip 'ready' (or 'failed' with the error) and deletes the raw parts.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = 'https://etdbjahwegsmuelcawgf.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('set SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = {apikey: KEY, Authorization: `Bearer ${KEY}`};
const FORMATS = new Set(['comment_bait', 'bait_peek', 'app_reveal', 'text_remake', 'screen_payoff']);
const max = Number(process.argv[process.argv.indexOf('--max') + 1]) || 3;
const log = (...a) => console.log('›', ...a);

async function rest(method, q, body) {
	const r = await fetch(`${URL_}/rest/v1/${q}`, {method, headers: {...H, 'content-type': 'application/json', Prefer: 'return=representation'}, body: body ? JSON.stringify(body) : undefined});
	if (!r.ok) throw new Error(`${method} ${q}: ${r.status} ${await r.text()}`);
	return r.json();
}
const patchClip = (id, b) => rest('PATCH', `pipe_clips?id=eq.${id}`, {...b, updated_at: new Date().toISOString()});

async function claim() {
	const stale = new Date(Date.now() - 45 * 60e3).toISOString();
	const [c] = await rest('GET', `pipe_clips?select=*&or=(status.eq.queued,and(status.eq.processing,started_at.lt.${stale}))&order=created_at&limit=1`);
	if (!c) return null;
	// only one worker gets it: the update matches the status we just read
	const got = await rest('PATCH', `pipe_clips?id=eq.${c.id}&status=eq.${c.status}`, {status: 'processing', started_at: new Date().toISOString(), error: null});
	return got[0] || null;
}

async function download(clip) {
	const r = await fetch(`${URL_}/storage/v1/object/list/pipe-inbox`, {method: 'POST', headers: {...H, 'content-type': 'application/json'}, body: JSON.stringify({prefix: clip.id, limit: 100, sortBy: {column: 'name', order: 'asc'}})});
	const parts = (await r.json()).map((f) => f.name).filter((n) => n.startsWith('part-')).sort();
	if (!parts.length || (clip.parts && parts.length < clip.parts)) throw new Error(`upload incomplete (${parts.length}/${clip.parts ?? '?'} parts)`);
	const ext = (path.extname(clip.upload_name || '') || '.mov').toLowerCase();
	fs.mkdirSync(path.join(ROOT, 'input'), {recursive: true});
	const file = path.join(ROOT, 'input', `up-${clip.id.slice(0, 8)}${ext}`);
	fs.writeFileSync(file, '');
	for (const p of parts) {
		const res = await fetch(`${URL_}/storage/v1/object/pipe-inbox/${clip.id}/${p}`, {headers: H});
		if (!res.ok) throw new Error(`download ${p}: ${res.status}`);
		fs.appendFileSync(file, Buffer.from(await res.arrayBuffer()));
	}
	log(`${clip.upload_name}: ${(fs.statSync(file).size / 1e6).toFixed(1)} MB in ${parts.length} part(s)`);
	return {file, parts};
}

async function uploadPublic(file, key, type) {
	const r = await fetch(`${URL_}/storage/v1/object/pipe/${key}`, {method: 'POST', headers: {...H, 'content-type': type, 'x-upsert': 'true'}, body: fs.readFileSync(file)});
	if (!r.ok) throw new Error(`upload ${key}: ${r.status} ${await r.text()}`);
	return `${URL_}/storage/v1/object/public/pipe/${key}`;
}

async function run(clip) {
	const {file, parts} = await download(clip);
	const job = path.basename(file).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
	const wants = clip.wants || [];
	const fmts = wants.filter((w) => FORMATS.has(w)), ids = wants.filter((w) => !FORMATS.has(w));
	const args = ['scripts/remake.mjs', file];
	if (ids.length) args.push('--templates', ids.join(','));
	else if (fmts.length) args.push('--formats', fmts.join(','));
	log('editing:', args.slice(2).join(' ') || 'learned mix');
	execFileSync('node', args, {cwd: ROOT, stdio: 'inherit'});
	// push-hq.mjs finds the clip row by source_name = <job>/<file name>
	await patchClip(clip.id, {source_name: `${job}/${path.basename(file)}`});
	execFileSync('node', ['scripts/push-hq.mjs', job], {cwd: ROOT, stdio: 'inherit', env: process.env});
	const thumb = path.join(ROOT, 'out', job, '_clip.jpg');
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '0.5', '-i', file, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', thumb]);
	const thumb_url = await uploadPublic(thumb, `${job}/_clip.jpg`, 'image/jpeg');
	const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim()) || null;
	await patchClip(clip.id, {status: 'ready', thumb_url, duration_sec: dur});
	await fetch(`${URL_}/storage/v1/object/pipe-inbox`, {method: 'DELETE', headers: {...H, 'content-type': 'application/json'}, body: JSON.stringify({prefixes: parts.map((p) => `${clip.id}/${p}`)})});
	log(`done: ${clip.upload_name} -> out/${job}`);
}

for (let i = 0; i < max; i++) {
	const clip = await claim();
	if (!clip) { log(i ? 'inbox empty' : 'nothing queued'); break; }
	log(`clip ${clip.id} (${clip.upload_name})`);
	try { await run(clip); }
	catch (e) {
		console.error(e);
		await patchClip(clip.id, {status: 'failed', error: String(e.message || e).slice(0, 900)}).catch(() => {});
	}
}
