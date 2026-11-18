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

async function putAsset(file, key, type) {
	const r = await fetch(`${URL_}/storage/v1/object/pipe-assets/${key}`, {method: 'POST', headers: {...H, 'content-type': type, 'x-upsert': 'true'}, body: fs.readFileSync(file)});
	if (!r.ok) throw new Error(`asset ${key}: ${r.status}`);
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
	// keep the trimmed face loop so approved ideas can be made later without new footage
	const face = path.join(ROOT, 'public/jobs', job, 'face.mp4');
	if (fs.existsSync(face)) await putAsset(face, `faces/${clip.id}.mp4`, 'video/mp4').catch((e) => log('face not saved', e.message));
	await fetch(`${URL_}/storage/v1/object/pipe-inbox`, {method: 'DELETE', headers: {...H, 'content-type': 'application/json'}, body: JSON.stringify({prefixes: parts.map((p) => `${clip.id}/${p}`)})});
	log(`done: ${clip.upload_name} -> out/${job}`);
}

// ---------- ideas approved in HQ ("make it") ----------
const EXTRA = path.join(ROOT, 'refs/extra.json');
async function writeExtra() {
	const done = await rest('GET', 'pipe_requests?select=template&status=eq.ready&template=not.is.null');
	fs.writeFileSync(EXTRA, JSON.stringify(done.map((d) => d.template), null, 1));
}
async function claimRequest() {
	const stale = new Date(Date.now() - 45 * 60e3).toISOString();
	const [r] = await rest('GET', `pipe_requests?select=*&or=(status.eq.approved,and(status.eq.making,started_at.lt.${stale}))&order=created_at&limit=1`);
	if (!r) return null;
	const got = await rest('PATCH', `pipe_requests?id=eq.${r.id}&status=eq.${r.status}`, {status: 'making', started_at: new Date().toISOString(), error: null});
	return got[0] || null;
}
const patchReq = (id, b) => rest('PATCH', `pipe_requests?id=eq.${id}`, {...b, updated_at: new Date().toISOString()});

// Turns a reference video into a template: its audio (yt-dlp), its on-screen text, timing from the audio length.
function buildTemplate(req, audioRel, audioSec) {
	const o = req.idea || {};
	const text = String(o.on_screen_text || o.hook_paraphrase || '').replace(/[\u2014\u2013]/g, ', ').replace(/\s*👇+/gu, '').trim();
	if (!text) throw new Error('this idea has no on-screen text to copy');
	const lines = text.split('\n');
	const widest = Math.max(...lines.map((l) => [...l].length));
	const comment = /comment/i.test(text);
	return {
		id: `r${req.id.slice(0, 6)}`, ref: `${o.account || 'idea'} (approved in HQ)`, views: o.views || 0,
		durationSec: +Math.min(12, Math.max(6, Math.min(audioSec, Number(o.length_sec) || audioSec))).toFixed(2),
		audio: audioRel,
		texts: [{text, y: lines.length > 6 ? 900 : 760, w: Math.max(520, Math.min(860, widest * 34)), linePx: 88}],
		app: null, format: comment ? 'comment_bait' : 'text_remake',
		sound: o.audio_url ? {name: o.audio_name || 'original sound', url: o.audio_url} : null,
	};
}

async function make(req) {
	// newest saved faces first
	const r = await fetch(`${URL_}/storage/v1/object/list/pipe-assets`, {method: 'POST', headers: {...H, 'content-type': 'application/json'}, body: JSON.stringify({prefix: 'faces', limit: 50, sortBy: {column: 'created_at', order: 'desc'}})});
	const faces = (await r.json()).map((f) => f.name).filter((n) => n.endsWith('.mp4'));
	if (!faces.length) { await patchReq(req.id, {status: 'needs_clip', error: 'upload a deadpan clip first'}); log('no clips to use'); return; }
	// audio from the reference
	const rel = `refaudio/req-${req.id.slice(0, 8)}.m4a`, dest = path.join(ROOT, 'public', rel);
	if (!fs.existsSync(dest)) {
		execFileSync('yt-dlp', ['-q', '--no-warnings', '-x', '--audio-format', 'm4a', '-o', dest.replace(/\.m4a$/, '.%(ext)s'), req.url], {stdio: 'inherit', timeout: 240e3});
		await putAsset(dest, `public/${rel}`, 'audio/mp4');
	}
	const audioSec = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]).toString().trim()) || 8;
	const t = buildTemplate(req, rel, audioSec);
	await patchReq(req.id, {template: t});
	await writeExtra();
	const list = JSON.parse(fs.readFileSync(EXTRA, 'utf8')).filter((x) => x.id !== t.id);
	fs.writeFileSync(EXTRA, JSON.stringify([...list, t], null, 1));
	// render on the newest face: one trial reel per account
	const faceKey = faces[0];
	const file = path.join(ROOT, 'input', `idea-${req.id.slice(0, 8)}.mp4`);
	fs.mkdirSync(path.dirname(file), {recursive: true});
	const fr = await fetch(`${URL_}/storage/v1/object/pipe-assets/faces/${faceKey}`, {headers: H});
	if (!fr.ok) throw new Error(`face ${faceKey}: ${fr.status}`);
	fs.writeFileSync(file, Buffer.from(await fr.arrayBuffer()));
	execFileSync('node', ['scripts/remake.mjs', file, '--templates', t.id, '--per', '2', '--trial-only'], {cwd: ROOT, stdio: 'inherit'});
	const job = path.basename(file).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
	execFileSync('node', ['scripts/push-hq.mjs', job], {cwd: ROOT, stdio: 'inherit', env: process.env});
	const [clip] = await rest('GET', `pipe_clips?select=id&source_name=eq.${encodeURIComponent(`${job}/${path.basename(file)}`)}`);
	await patchReq(req.id, {status: 'ready', clip_id: clip?.id ?? null});
	log(`idea made: ${req.url}`);
}

await writeExtra().catch((e) => log('extra templates not loaded', e.message));
for (let i = 0; i < max; i++) {
	const req = await claimRequest();
	if (!req) break;
	log(`idea ${req.url}`);
	try { await make(req); }
	catch (e) { console.error(e); await patchReq(req.id, {status: 'failed', error: String(e.message || e).slice(0, 900)}).catch(() => {}); }
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
