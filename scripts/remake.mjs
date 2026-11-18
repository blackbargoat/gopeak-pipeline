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
import {audio, caption, footage} from './vary.mjs';
import {snap} from './beats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const ACCOUNTS = ['maverick.pranks', 'mav.tallteen'];
const aspectOf = (img) => {
	const [w, h] = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(PUBLIC, img)]).toString().trim().split(',').map(Number);
	return h / w;
};

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
	// Templates built from ideas approved in HQ (written by worker.mjs from pipe_requests)
	const extra = path.join(ROOT, 'refs/extra.json');
	if (fs.existsSync(extra)) templates.push(...JSON.parse(fs.readFileSync(extra, 'utf8')).filter((t) => !templates.some((x) => x.id === t.id)));
	const wanted = args.templates ? String(args.templates).split(',') : null;

	log('bundling…');
	const jobs = inputs.map((input, k) => {
		const jobId = path.basename(input).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
		const jobDir = path.join(PUBLIC, 'jobs', jobId);
		fs.mkdirSync(jobDir, {recursive: true});
		return {input, jobId, jobDir, k, ...prepareFace(input, jobDir)};
	});
	const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: PUBLIC});

	// Settings come from config.json (edited from HQ's agent panels). Mix weights may be updated by learn.mjs.
	const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
	const learned = fs.existsSync(path.join(ROOT, 'learned.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'learned.json'), 'utf8')) : null;
	// --formats comment_bait,bait_peek limits this run to those formats (split evenly), e.g. from HQ's upload sheet
	const onlyFmts = args.formats ? String(args.formats).split(',').filter(Boolean) : null;
	const baseMix = CFG.learn && learned?.mix ? learned.mix : CFG.mix;
	const mix = onlyFmts ? Object.fromEntries(onlyFmts.map((f) => [f, 1 / onlyFmts.length])) : baseMix;
	// Every clip: FEED normal posts (the proven winning format, untouched look) + TRIALS trial reels
	// (slowed down, recolored, different caption/audio so each is its own upload).
	const FEED = args['trial-only'] ? 0 : Number(CFG.feedPerClip ?? 2), TRIALS = Number(CFG.trialsPerClip ?? 3);
	const nUses = args.per ? Number(args.per) : FEED + TRIALS;
	// feed posts use the format of our single best-performing template (format averages get dragged down by old posts)

	// Which formats this clip gets: largest-remainder split of nUses by the mix, comment bait first so each
	// account opens with the format that drives comments.
	const formatPlan = (n) => {
		const keys = Object.keys(mix);
		const raw = keys.map((k) => [k, mix[k] * n]);
		const out = Object.fromEntries(raw.map(([k, v]) => [k, Math.floor(v)]));
		let left = n - Object.values(out).reduce((a, b) => a + b, 0);
		for (const [k] of raw.sort((x, y) => (y[1] % 1) - (x[1] % 1))) if (left-- > 0) out[k]++;
		const seq = [];
		for (const k of keys.sort((x, y) => (x === 'comment_bait' ? -1 : y === 'comment_bait' ? 1 : 0))) for (let i = 0; i < out[k]; i++) seq.push(k);
		return seq;
	};
	// Rank templates by our own results when we have them; untested ones use the reference's views scaled down
	// (a GoTall outlier's views aren't comparable to ours), so proven templates come first.
	const rank = (t) => learned?.templates?.[t.id]?.score ?? t.views * 0.05;
	const pool = (wanted ? templates.filter((t) => wanted.includes(t.id)) : templates).sort((x, y) => rank(y) - rank(x));
	const byFmt = (f) => (pool.filter((t) => t.format === f).length ? pool.filter((t) => t.format === f) : pool);
	const best = pool.find((t) => learned?.templates?.[t.id])?.format || 'comment_bait';
	for (const job of jobs) {
		const seq = wanted ? [...Array(nUses)].map((_, i) => pool[i % pool.length].format) : onlyFmts ? formatPlan(nUses) : [...Array(Math.min(FEED, nUses)).fill(best), ...formatPlan(Math.max(0, nUses - FEED))];
		const seen = {};
		const picks = seq.map((f, i) => {
			const list = byFmt(f);
			seen[f] = (seen[f] ?? -1) + 1;
			const t = wanted ? pool[i % pool.length] : list[(job.k * 2 + seen[f]) % list.length];
			const reuse = Math.floor(seen[f] / list.length); // >0 only when a format has fewer templates than uses
			return {t, f, vi: i, reuse};
		});
		const outDir = path.join(ROOT, 'out', job.jobId);
		fs.mkdirSync(outDir, {recursive: true});
		const manifest = {jobId: job.jobId, source: path.resolve(job.input), createdAt: new Date().toISOString(), settings: {nUses, mix, vary: CFG.vary}, variants: []};
		for (const {t, vi} of picks) {
			const i = vi;
			const account = ACCOUNTS[i % ACCOUNTS.length];
			const trial = i >= FEED;
			const id = `${account}-${trial ? 't' : 'f'}${Math.floor(i / ACCOUNTS.length) + 1}-ref${t.id}`;
			const audioPool = [...new Set(byFmt(t.format).map((x) => x.audio))];
			const texts = t.texts.map((x) => ({...x, text: caption(x.text, i, CFG.vary, t.alts || [])}));
			const firstText = texts[0]?.text ?? t.table?.title ?? '';
			const inputProps = {
				face: path.relative(PUBLIC, job.face).split(path.sep).join('/'),
				faceLoopSec: job.loopSec,
				durationSec: t.durationSec,
				audio: audio(t, i, audioPool, CFG.vary),
				texts,
				app: t.app,
				screens: t.screens || [],
				table: t.table || null,
				appAspect: t.app ? aspectOf(t.app.image) : 1,
				...footage(i, CFG.vary, i >= FEED ? i - FEED : null),
			};
			// Land every cut on a beat of the audio this variant actually uses.
			const aFile = path.join(PUBLIC, inputProps.audio);
			if (inputProps.app) {
				const at0 = inputProps.app.atSec, at = snap(aFile, at0, 0.6);
				inputProps.app = {...inputProps.app, atSec: at};
				inputProps.texts = inputProps.texts.map((x) => (x.to != null && Math.abs(x.to - at0) < 0.01 ? {...x, to: at} : x));
			}
			if (inputProps.screens.length) {
				const sc = inputProps.screens.map((x) => ({...x}));
				const hook0 = sc[0].from;
				sc.forEach((x, k) => (x.from = snap(aFile, x.from, k === 0 ? 1.0 : 0.5)));
				sc.forEach((x, k) => (x.to = k < sc.length - 1 ? sc[k + 1].from : x.to));
				inputProps.screens = sc;
				inputProps.texts = inputProps.texts.map((x) => (x.to != null && Math.abs(x.to - hook0) < 0.01 ? {...x, to: sc[0].from} : x));
			}
			const composition = await selectComposition({serveUrl, id: 'Remake', inputProps});
			const file = path.join(outDir, `${id}.mp4`);
			log(`render ${id} (ref @${t.ref}, ${(t.views / 1000).toFixed(0)}K views)`);
			await renderMedia({composition, serveUrl, codec: 'h264', crf: 18, audioBitrate: '192k', outputLocation: file, inputProps});
			manifest.variants.push({id, account, template: t.id, format: t.format, ref: t.ref, sound: t.sound || null, text: firstText, audio: inputProps.audio, mirror: inputProps.mirror, trial, rate: inputProps.rate, file: path.relative(ROOT, file)});
		}
		fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
		log(`done → ${outDir}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
