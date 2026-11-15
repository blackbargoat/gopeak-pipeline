#!/usr/bin/env node
// Deadpan face clip -> exact recreations of the HQ reference outliers (refs/templates.json).
//
//   node scripts/remake.mjs <clip> [more clips…] [--templates 03,15] [--per 4]
//
// Each clip: trims the phone-setup wobble at the start/end, builds a forward+reverse loop so short
// clips fill any reference length, then renders up to 4 different references (2 per account).

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const ACCOUNTS = ['maverick.pranks', 'mav.tallteen'];
const ASPECT = {'app/result.png': 2340 / 1320, 'app/ring.png': 1340 / 1320};

const log = (...a) => console.log('›', ...a);
const duration = (f) =>
	Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

// Frame-to-frame motion (mean luma difference on a 96px copy). The phone being set down or picked up
// shows as high motion; a deadpan stare sits near 1-2.
export function stillRange(input, threshold = 4, holdSec = 0.5) {
	const r = spawnSync('ffmpeg', ['-hide_banner', '-i', input, '-vf', 'scale=96:-2,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});
	const t = [...r.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
	const y = [...r.stderr.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
	const n = Math.min(t.length, y.length);
	const total = duration(input);
	if (n < 10) return [0, total];
	const calm = (i) => y[i] <= threshold;
	let start = 0;
	for (let i = 0; i < n; i++) {
		let j = i;
		while (j < n && calm(j) && t[j] - t[i] < holdSec) j++;
		if (j < n && t[j] - t[i] >= holdSec) {
			start = t[i];
			break;
		}
	}
	let end = total;
	for (let i = n - 1; i > 0; i--) {
		if (calm(i)) {
			end = t[i];
			break;
		}
	}
	return end - start > 1 ? [start, end] : [0, total];
}

function prepareFace(input, jobDir) {
	const [a, b] = stillRange(input);
	log(`${path.basename(input)}: usable ${a.toFixed(2)}s → ${b.toFixed(2)}s (${(b - a).toFixed(1)}s)`);
	const out = path.join(jobDir, 'face.mp4');
	execFileSync('ffmpeg', [
		'-hide_banner', '-y', '-ss', a.toFixed(3), '-to', b.toFixed(3), '-i', input,
		'-filter_complex',
		'[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,split[f][r];[r]reverse[rv];[f][rv]concat=n=2:v=1:a=0[v]',
		'-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', out,
	], {stdio: ['ignore', 'ignore', 'pipe']});
	return {face: out, loopSec: duration(out), usable: b - a};
}

const parseArgs = (argv) => {
	const out = {_: []};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			const next = argv[i + 1];
			out[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : argv[++i];
		} else out._.push(argv[i]);
	}
	return out;
};

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const inputs = [...new Set(args._)].filter((f) => fs.existsSync(f));
	if (!inputs.length) {
		console.error('usage: node scripts/remake.mjs <clip> [more clips] [--templates 03,15] [--per 4]');
		process.exit(1);
	}
	const {templates} = JSON.parse(fs.readFileSync(path.join(ROOT, 'refs/templates.json'), 'utf8'));
	const wanted = args.templates ? String(args.templates).split(',') : null;
	const per = Math.min(4, Number(args.per ?? 4));

	log('bundling…');
	const jobs = inputs.map((input, k) => {
		const jobId = path.basename(input).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
		const jobDir = path.join(PUBLIC, 'jobs', jobId);
		fs.mkdirSync(jobDir, {recursive: true});
		return {input, jobId, jobDir, k, ...prepareFace(input, jobDir)};
	});
	const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: PUBLIC});

	// Content mix per clip (see PLAN.md): each account gets one comment-bait post (Mav's proven "Flex your
	// height" format, the reply bot turns comments into installs) and one remake, mostly ones that end on
	// the GoPeak result screen. Pools rotate by clip so clips filmed the same day get different references.
	const pool = (wanted ? templates.filter((t) => wanted.includes(t.id)) : templates).sort((x, y) => y.views - x.views);
	const byFmt = (f) => pool.filter((t) => t.format === f);
	const ORDER = ['comment_bait', 'comment_bait', 'app_reveal', null]; // null = text_remake on even clips, app_reveal on odd
	const used = new Set();
	const take = (fmt, k) => {
		const list = byFmt(fmt).length ? byFmt(fmt) : pool;
		for (let i = 0; i < list.length; i++) {
			const t = list[(k + i) % list.length];
			if (!used.has(`${k}:${t.id}`)) return used.add(`${k}:${t.id}`), t;
		}
		return list[k % list.length];
	};
	for (const job of jobs) {
		const picks = wanted
			? pool.slice(0, per)
			: ORDER.slice(0, per).map((f, i) => take(f ?? (job.k % 2 ? 'app_reveal' : 'text_remake'), job.k * 2 + i));
		const outDir = path.join(ROOT, 'out', job.jobId);
		fs.mkdirSync(outDir, {recursive: true});
		const manifest = {jobId: job.jobId, source: path.resolve(job.input), createdAt: new Date().toISOString(), variants: []};
		for (const [i, t] of picks.entries()) {
			const account = ACCOUNTS[i % ACCOUNTS.length];
			const id = `${account}-${Math.floor(i / ACCOUNTS.length) + 1}-ref${t.id}`;
			const inputProps = {
				face: path.relative(PUBLIC, job.face).split(path.sep).join('/'),
				faceLoopSec: job.loopSec,
				durationSec: t.durationSec,
				audio: t.audio,
				texts: t.texts,
				app: t.app,
				appAspect: t.app ? ASPECT[t.app.image] : 1,
			};
			const composition = await selectComposition({serveUrl, id: 'Remake', inputProps});
			const file = path.join(outDir, `${id}.mp4`);
			log(`render ${id} (ref @${t.ref}, ${(t.views / 1000).toFixed(0)}K views)`);
			await renderMedia({composition, serveUrl, codec: 'h264', crf: 18, audioBitrate: '192k', outputLocation: file, inputProps});
			manifest.variants.push({id, account, template: t.id, format: t.format, ref: t.ref, text: t.texts[0].text, file: path.relative(ROOT, file)});
		}
		fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
		log(`done → ${outDir}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
