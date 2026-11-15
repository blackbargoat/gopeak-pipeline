#!/usr/bin/env node
// Publishes the format library + sound list to GoPeak HQ:
//   GoPeakHQ/formats/<key>.mp4 + .jpg  (720p samples, small)
//   GoPeakHQ/data/formats.json         (formats, status from Mav's review, sounds with source links)
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HQ = path.resolve(ROOT, '../GoPeakHQ');
const OUTDIR = path.join(HQ, 'formats');
fs.mkdirSync(OUTDIR, {recursive: true});

const manifests = fs.readdirSync(path.join(ROOT, 'out')).filter((d) => fs.existsSync(path.join(ROOT, 'out', d, 'manifest.json')));
const variants = manifests.flatMap((d) => JSON.parse(fs.readFileSync(path.join(ROOT, 'out', d, 'manifest.json'), 'utf8')).variants);
const byTemplate = (id) => variants.filter((v) => v.template === id).pop();

// key, name, what it is, sample template (or file), status after Mav's review on Nov 15
const FORMATS = [
	['comment_bait', 'Comment bait', 'Deadpan + colored legend (Tall / Potential / Cooked). People comment their height, the reply bot answers with the app. Your proven winner.', 'f1', 'fixed'],
	['bait_peek', 'Bait + peek', 'Chart or legend, then only the Home-ring card + "comment your height for a prediction". Cut on the beat.', 'p08', 'fixed'],
	['corner', 'Cooked + card', 'GoTall IG style (441K views): "If you are 5\'8 at 15... You MIGHT be COOKED", then the centered Home ring + "comment your height for a prediction".', 'c1', 'fixed'],
	['claim', 'Bold claim + card', '"EXTREMELY high chance of being 6ft+", then the Home ring + "comment your height for a prediction".', 'c2', 'fixed'],
	['screen_payoff', 'Screen payoff', 'Face hook, real app recording (parents, loading %), Home ring. Hard cuts on the beat.', 's2', 'approved'],
	['app_reveal', 'App reveal', 'GoTall outlier remake that ends on the GoPeak result screen.', '04', 'fixed'],
	['text_remake', 'Remake', 'GoTall outlier remake, text only. Reach.', '01', 'review'],
];

const sounds = JSON.parse(fs.readFileSync(path.join(ROOT, 'refs/sounds.json'), 'utf8'));
const out = {updatedAt: new Date().toISOString(), formats: [], sounds: []};
const tplToFormat = {};
for (const [key, name, desc, tpl, status] of FORMATS) {
	const src = tpl === 'explainer' ? path.join(ROOT, 'out/explainer/explainer-1.mp4') : byTemplate(tpl) && path.join(ROOT, byTemplate(tpl).file);
	if (!src || !fs.existsSync(src)) continue;
	const mp4 = path.join(OUTDIR, `${key}.mp4`), jpg = path.join(OUTDIR, `${key}.jpg`);
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', mp4]);
	execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', src, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '5', jpg]);
	out.formats.push({key, name, desc, status, video: `formats/${key}.mp4?v=${Date.now()}`, poster: `formats/${key}.jpg?v=${Date.now()}`});
	tplToFormat[tpl] = name;
}
const templates = JSON.parse(fs.readFileSync(path.join(ROOT, 'refs/templates.json'), 'utf8')).templates;
const fmtOf = (id) => {
	const t = templates.find((x) => x.id === id);
	return t ? {comment_bait: 'Comment bait', bait_peek: 'Bait + peek', app_reveal: 'App reveal', text_remake: 'Remake', screen_payoff: 'Screen payoff'}[t.format] : null;
};
for (const s of sounds) {
	const usedBy = [...new Set((s.used_by || []).map(fmtOf).filter(Boolean))];
	out.sounds.push({name: s.sound, creator: s.creator, views: s.views, tiktok: s.tiktok, video: s.video, usedBy});
}
out.sounds.sort((a, b) => b.usedBy.length - a.usedBy.length || b.views - a.views);
fs.writeFileSync(path.join(HQ, 'data/formats.json'), JSON.stringify(out, null, 1));
const size = fs.readdirSync(OUTDIR).reduce((t, f) => t + fs.statSync(path.join(OUTDIR, f)).size, 0);
console.log(`formats: ${out.formats.length}, sounds: ${out.sounds.length}, ${(size / 1e6).toFixed(1)} MB in GoPeakHQ/formats`);
