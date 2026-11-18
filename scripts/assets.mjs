#!/usr/bin/env node
// Files the renders need that don't live in the (public) git repo: the CapCut Classic font and the reference
// audio. They sit in the private Supabase bucket pipe-assets.
//   SUPABASE_SERVICE_KEY=... node scripts/assets.mjs push   (Mac: upload local copies)
//   SUPABASE_SERVICE_KEY=... node scripts/assets.mjs pull   (cloud worker: download what's missing)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = 'https://etdbjahwegsmuelcawgf.supabase.co/storage/v1';
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) { console.error('set SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = {apikey: KEY, Authorization: `Bearer ${KEY}`};
const DIRS = ['public/refaudio', 'public/fonts'];
const SKIP = /AppleColorEmoji|TikTokSans/; // emoji font comes from setup.mjs, TikTok Sans is in git

async function list(prefix) {
	const r = await fetch(`${URL_}/object/list/pipe-assets`, {method: 'POST', headers: {...H, 'content-type': 'application/json'}, body: JSON.stringify({prefix, limit: 1000})});
	return (await r.json()).map((f) => f.name);
}

const mode = process.argv[2];
for (const dir of DIRS) {
	fs.mkdirSync(path.join(ROOT, dir), {recursive: true});
	if (mode === 'push') {
		for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((x) => !x.startsWith('.') && !SKIP.test(x))) {
			const r = await fetch(`${URL_}/object/pipe-assets/${dir}/${f}`, {method: 'POST', headers: {...H, 'x-upsert': 'true', 'content-type': 'application/octet-stream'}, body: fs.readFileSync(path.join(ROOT, dir, f))});
			console.log(r.ok ? 'up' : `FAILED ${r.status}`, `${dir}/${f}`);
		}
	} else if (mode === 'pull') {
		for (const f of await list(dir)) {
			const dest = path.join(ROOT, dir, f);
			if (fs.existsSync(dest)) continue;
			const r = await fetch(`${URL_}/object/pipe-assets/${dir}/${f}`, {headers: H});
			if (!r.ok) throw new Error(`${dir}/${f}: ${r.status}`);
			fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
			console.log('got', `${dir}/${f}`);
		}
	} else { console.error('usage: assets.mjs push|pull'); process.exit(1); }
}
