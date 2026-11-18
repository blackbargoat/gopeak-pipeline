#!/usr/bin/env node
// Keeps Supabase storage under the free 1 GB: deletes files nothing needs anymore.
//   - rendered videos of posts that went live more than 3 days ago (Instagram has its own copy); the cover image stays
//   - videos of posts that were skipped more than 3 days ago
//   - raw upload parts of clips that failed or were hidden more than 7 days ago
// Runs from .github/workflows/worker.yml every few minutes; each pass is a couple of small requests.
//   SUPABASE_SERVICE_KEY=... node scripts/cleanup.mjs
const URL_ = 'https://etdbjahwegsmuelcawgf.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('set SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = {apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json'};
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
const PUB = `${URL_}/storage/v1/object/public/pipe/`;

async function rest(method, q, body) {
	const r = await fetch(`${URL_}/rest/v1/${q}`, {method, headers: {...H, Prefer: 'return=representation'}, body: body ? JSON.stringify(body) : undefined});
	if (!r.ok) throw new Error(`${method} ${q}: ${r.status} ${await r.text()}`);
	return r.json();
}
const remove = async (bucket, keys) => {
	if (!keys.length) return 0;
	const r = await fetch(`${URL_}/storage/v1/object/${bucket}`, {method: 'DELETE', headers: H, body: JSON.stringify({prefixes: keys})});
	return r.ok ? (await r.json()).length : 0;
};

// 1. finished posts
const done = await rest('GET', `pipe_posts?select=id,video_url&video_url=not.is.null&or=(and(status.eq.posted,updated_at.lt.${ago(3)}),and(status.eq.skipped,updated_at.lt.${ago(3)}))&limit=200`);
const keys = done.map((p) => p.video_url).filter((u) => u.startsWith(PUB)).map((u) => decodeURIComponent(u.slice(PUB.length)));
// a repost shares its original's file: only delete files no unfinished post still points at
const live = keys.length ? await rest('GET', `pipe_posts?select=video_url&status=in.(rendered,scheduled,posting)&video_url=in.(${keys.map((k) => `"${PUB}${k}"`).join(',')})`) : [];
const keep = new Set(live.map((p) => p.video_url));
const gone = keys.filter((k) => !keep.has(PUB + k));
const n1 = await remove('pipe', gone);
const cleared = done.filter((p) => !keep.has(p.video_url)).map((p) => p.id);
if (cleared.length) await rest('PATCH', `pipe_posts?id=in.(${cleared.join(',')})`, {video_url: null});

// 2. raw parts of clips nobody will edit again
const dead = await rest('GET', `pipe_clips?select=id&status=in.(failed,archived)&updated_at=lt.${ago(7)}&limit=50`);
let n2 = 0;
for (const c of dead) {
	const r = await fetch(`${URL_}/storage/v1/object/list/pipe-inbox`, {method: 'POST', headers: H, body: JSON.stringify({prefix: c.id, limit: 100})});
	const files = r.ok ? (await r.json()).map((f) => `${c.id}/${f.name}`) : [];
	n2 += await remove('pipe-inbox', files);
}
console.log(`cleanup: ${n1} posted videos, ${n2} old upload parts`);
