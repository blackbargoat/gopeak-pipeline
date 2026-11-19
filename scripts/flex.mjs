#!/usr/bin/env node
// Hand-picked "Flex your height with your age" trial reels (owner request 2026-11-19).
// Same proven Flex legends (templates f1/f2/f3), but each video uses a different stretch of a face clip,
// a different sound, a different speed (0.9-1.1x), mirror and color grade, so every upload is its own file.
//
//   node scripts/flex.mjs plan.json      -> renders out/flex-<date>/<variant>.mp4 + .jpg and a manifest.json
//
// plan.json: [{account, face, start, template: "f1"|"f2"|"f3", audio: "refaudio/06.m4a", rate, mirror, zoom, shiftX, grade, text?}]
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const tpl = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'refs/templates.json'), 'utf8')).templates.map((t) => [t.id, t]));
const day = new Date().toISOString().slice(0, 10);
const jobId = `flex-${day}`;
const jobDir = path.join(PUBLIC, 'jobs', jobId);
const outDir = path.join(ROOT, 'out', jobId);
fs.mkdirSync(jobDir, {recursive: true});
fs.mkdirSync(outDir, {recursive: true});
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());

// one face loop per (clip, start): 4.5 s of the clip, played forward then backward (same as remake.mjs)
function face(src, start, seg = 4.5) {
	const out = path.join(jobDir, `${path.basename(src).replace(/\W+/g, '_')}_${start}.mp4`);
	if (!fs.existsSync(out))
		execFileSync('ffmpeg', ['-hide_banner', '-y', '-ss', String(start), '-t', String(seg), '-i', src, '-filter_complex',
			'[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,split[f][r];[r]reverse[rv];[f][rv]concat=n=2:v=1:a=0[v]',
			'-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', out], {stdio: ['ignore', 'ignore', 'pipe']});
	return out;
}

const faces = plan.map((p) => face(p.face, p.start));   // before bundling: the bundle copies public/ once
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: PUBLIC});
const manifest = [];
for (const [i, p] of plan.entries()) {
	const t = tpl[p.template];
	const f = faces[i];
	const id = `${p.account}-x${i + 1}-ref${t.id}`;
	const texts = t.texts.map((x, k) => ({...x, text: k === 0 && p.text ? p.text : x.text}));
	const inputProps = {
		face: path.relative(PUBLIC, f).split(path.sep).join('/'), faceLoopSec: dur(f), durationSec: t.durationSec,
		audio: p.audio, texts, app: null, screens: [], table: null, appAspect: 1,
		mirror: !!p.mirror, zoom: p.zoom ?? 1.04, shiftX: p.shiftX ?? 0, rate: p.rate ?? 1,
		grade: p.grade ?? {brightness: 1, contrast: 1, saturate: 1},
	};
	const file = path.join(outDir, `${id}.mp4`);
	if (!fs.existsSync(file)) {   // resume: finished renders are kept
		const composition = await selectComposition({serveUrl, id: 'Remake', inputProps, timeoutInMilliseconds: 180000});
		await renderMedia({composition, serveUrl, codec: 'h264', crf: 18, audioBitrate: '192k', outputLocation: file, inputProps, timeoutInMilliseconds: 180000});
	}
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1.5', '-i', file, '-frames:v', '1', '-q:v', '3', file.replace(/\.mp4$/, '.jpg')]);
	manifest.push({id, account: p.account, template: t.id, format: t.format, text: texts[0].text, audio: p.audio, rate: inputProps.rate, mirror: inputProps.mirror, clip_id: p.clip_id, file: path.relative(ROOT, file)});
	console.log('›', id, p.audio, `${inputProps.rate}x`, inputProps.mirror ? 'mirrored' : '');
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({jobId, variants: manifest}, null, 1));
console.log('DONE', outDir);
