#!/usr/bin/env node
// Raw clip -> silence cut -> 9:16 -> captions -> up to 4 variants (2 per account).
//
//   node scripts/make.mjs input/clip.mov --hooks "hook one|hook two|hook three|hook four" \
//        --cta "your full prediction in the app, link in bio"
//
// Optional sidecar: input/clip.json with {hooks, cta, accounts, perAccount, musicVolume}.
// Works the same on macOS and Windows (needs Node 18+ and ffmpeg on PATH).

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {downloadWhisperModel, installWhisperCpp, toCaptions, transcribe} from '@remotion/install-whisper-cpp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const WHISPER_DIR = path.join(ROOT, 'whisper.cpp');
const WHISPER_VERSION = '1.5.5';
const WHISPER_MODEL = 'small.en';

export const DEFAULTS = {
	accounts: ['maverick.pranks', 'mav.tallteen'],
	perAccount: 2, // => max 4 uses of one clip, 2 per account
	musicVolume: 0.1,
	hooks: [
		'POV: an app guessed my final height',
		'I asked an app how tall I’ll be…',
		'Doctors hate this height trick',
		'How tall will you actually be?',
	],
	cta: 'your full prediction in the app, link in bio',
	silenceDb: -35,
	minSilenceSec: 0.35,
	padSec: 0.12,
};

const ACCENTS = ['#FFE14D', '#4DFF88', '#4DC3FF', '#FF5C8A'];
const ZOOMS = [1.0, 1.04, 1.07, 1.1];

const log = (...a) => console.log('›', ...a);
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-y', ...args], {stdio: ['ignore', 'ignore', 'pipe']});
const duration = (f) =>
	Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

const parseArgs = (argv) => {
	const out = {_: []};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			const next = argv[i + 1];
			out[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : argv[++i];
		}
		else out._.push(argv[i]);
	}
	return out;
};

// Seeded shuffle so a job always makes the same variants if re-run.
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const shuffle = (arr, r) => arr.map((v) => [r(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

export function keepRanges(input, {silenceDb, minSilenceSec, padSec}) {
	const total = duration(input);
	const res = spawnSync('ffmpeg', ['-hide_banner', '-i', input, '-af', `silencedetect=n=${silenceDb}dB:d=${minSilenceSec}`, '-f', 'null', '-'], {
		encoding: 'utf8',
	});
	const silences = [];
	let start = null;
	for (const line of res.stderr.split('\n')) {
		const s = line.match(/silence_start: ([\d.]+)/);
		const e = line.match(/silence_end: ([\d.]+)/);
		if (s) start = Number(s[1]);
		if (e && start !== null) {
			silences.push([start, Number(e[1])]);
			start = null;
		}
	}
	if (start !== null) silences.push([start, total]);
	const keep = [];
	let cursor = 0;
	for (const [s, e] of silences) {
		const a = cursor;
		const b = Math.min(total, s + padSec);
		if (b - a > 0.05) keep.push([a, b]);
		cursor = Math.max(0, e - padSec);
	}
	if (total - cursor > 0.05) keep.push([cursor, total]);
	return {total, keep: keep.length ? keep : [[0, total]]};
}

// Finds baked-in black bars (letterbox/pillarbox) so they get cropped before the 9:16 fill.
export function detectCrop(input) {
	const total = duration(input);
	const res = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(Math.min(1, total / 4)), '-t', '6', '-i', input, '-vf', 'cropdetect=limit=24:round=2:reset=0', '-f', 'null', '-'], {
		encoding: 'utf8',
	});
	const all = [...res.stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
	if (!all.length) return null;
	const [, w, h, x, y] = all[all.length - 1].map(Number);
	return w > 100 && h > 100 ? {w, h, x, y} : null;
}

function prepare(input, jobDir, opts) {
	const crop = detectCrop(input);
	if (crop) log(`active picture: ${crop.w}x${crop.h} at ${crop.x},${crop.y}`);
	const cropF = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : '';
	const [srcW, srcH] = crop
		? [crop.w, crop.h]
		: execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', input])
				.toString().trim().split(',').map(Number);
	// Phone-shaped footage fills the frame. Landscape footage would need a ~3x blow-up to fill 9:16,
	// so it sits full-width over a blurred, zoomed copy of itself instead.
	const wide = srcW / srcH > 1;
	const frame = wide
		? `split[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:2,eq=brightness=-0.12[bgb];` +
			`[fg]scale=1080:-2[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1`
		: `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1`;
	log(wide ? 'landscape source: blur-fill' : 'vertical source: fill');
	const {total, keep} = keepRanges(input, opts);
	const kept = keep.reduce((t, [a, b]) => t + (b - a), 0);
	log(`silence cut: ${total.toFixed(1)}s -> ${kept.toFixed(1)}s (${keep.length} pieces)`);
	const sel = keep.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+');
	const cut = path.join(jobDir, 'cut.mp4');
	ff([
		'-i', input,
		'-filter_complex',
		`[0:v]fps=30,select='${sel}',setpts=N/30/TB,${cropF}${frame}[v];` +
			`[0:a]aselect='${sel}',asetpts=N/SR/TB,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,
		'-map', '[v]', '-map', '[a]',
		'-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
		'-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
		cut,
	]);
	return cut;
}

async function captionsFor(cut, jobDir) {
	const cache = path.join(jobDir, 'captions.json');
	if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
	await installWhisperCpp({to: WHISPER_DIR, version: WHISPER_VERSION, printOutput: false});
	await downloadWhisperModel({model: WHISPER_MODEL, folder: WHISPER_DIR, printOutput: false});
	const wav = path.join(jobDir, 'audio16k.wav');
	ff(['-i', cut, '-ar', '16000', '-ac', '1', wav]);
	const out = await transcribe({
		inputPath: wav,
		whisperPath: WHISPER_DIR,
		whisperCppVersion: WHISPER_VERSION,
		model: WHISPER_MODEL,
		tokenLevelTimestamps: true,
		printOutput: false,
	});
	const {captions} = toCaptions({whisperCppOutput: out});
	fs.rmSync(wav);
	fs.writeFileSync(cache, JSON.stringify(captions, null, 1));
	return captions;
}

export function planVariants({jobId, durationSec, hooks, accounts, perAccount, cta, musicVolume}) {
	const r = rng([...jobId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
	const music = shuffle(fs.readdirSync(path.join(PUBLIC, 'music')).filter((f) => /\.(mp3|m4a|wav)$/i.test(f)), r);
	const hookOrder = shuffle(hooks, r);
	const n = Math.min(accounts.length * perAccount, 4);
	const variants = [];
	for (let i = 0; i < n; i++) {
		const account = accounts[i % accounts.length];
		const track = music.length ? music[i % music.length] : null;
		const trackLen = track ? duration(path.join(PUBLIC, 'music', track)) : 0;
		variants.push({
			id: `${account}-${Math.floor(i / accounts.length) + 1}`,
			account,
			props: {
				video: `jobs/${jobId}/cut.mp4`,
				durationSec,
				hook: hookOrder[i % hookOrder.length],
				hookSec: 0,
				music: track ? `music/${track}` : null,
				musicVolume,
				musicStartSec: track ? Math.max(0, Math.floor(r() * Math.max(0, trackLen - durationSec - 5))) : 0,
				zoom: ZOOMS[i % ZOOMS.length],
				accent: ACCENTS[i % ACCENTS.length],
				cta: cta || null,
				ctaSec: 2.5,
			},
		});
	}
	return variants;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const input = args._[0];
	if (!input || !fs.existsSync(input)) {
		console.error('usage: node scripts/make.mjs <raw video> [--hooks "a|b|c|d"] [--cta "..."] [--only <variant id>]');
		process.exit(1);
	}
	const sidecar = input.replace(/\.[^.]+$/, '.json');
	const cfg = {...DEFAULTS, ...(fs.existsSync(sidecar) ? JSON.parse(fs.readFileSync(sidecar, 'utf8')) : {})};
	if (args.hooks) cfg.hooks = String(args.hooks).split('|').map((s) => s.trim()).filter(Boolean);
	if (args.cta !== undefined) cfg.cta = args.cta === 'none' ? null : args.cta;

	const jobId = path.basename(input).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
	const jobDir = path.join(PUBLIC, 'jobs', jobId);
	const outDir = path.join(ROOT, 'out', jobId);
	fs.mkdirSync(jobDir, {recursive: true});
	fs.mkdirSync(outDir, {recursive: true});

	const cut = fs.existsSync(path.join(jobDir, 'cut.mp4')) && !args.recut ? path.join(jobDir, 'cut.mp4') : prepare(input, jobDir, cfg);
	const durationSec = duration(cut);
	log('captioning (whisper.cpp, local)…');
	const captions = await captionsFor(cut, jobDir);
	log(`captions: ${captions.length} words`);

	let variants = planVariants({jobId, durationSec, ...cfg});
	if (args.only) variants = variants.filter((v) => v.id === args.only);

	log('bundling…');
	const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: PUBLIC});

	const manifest = {jobId, source: path.resolve(input), createdAt: new Date().toISOString(), durationSec, variants: []};
	for (const v of variants) {
		const inputProps = {...v.props, captions};
		const composition = await selectComposition({serveUrl, id: 'Clip', inputProps});
		const file = path.join(outDir, `${v.id}.mp4`);
		let last = -1;
		log(`render ${v.id}: "${v.props.hook}" + ${v.props.music ?? 'no music'}`);
		await renderMedia({
			composition,
			serveUrl,
			codec: 'h264',
			crf: 18,
			audioBitrate: '192k',
			outputLocation: file,
			inputProps,
			onProgress: ({progress}) => {
				const pct = Math.floor(progress * 4) * 25;
				if (pct !== last) process.stdout.write(`  ${(last = pct)}%`);
			},
		});
		process.stdout.write('\n');
		manifest.variants.push({id: v.id, account: v.account, hook: v.props.hook, music: v.props.music, file: path.relative(ROOT, file)});
	}
	fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
	log(`done -> ${outDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
