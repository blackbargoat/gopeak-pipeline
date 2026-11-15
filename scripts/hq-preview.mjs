#!/usr/bin/env node
// Builds out/hq-preview.json from the rendered jobs so the HQ Pipeline tab can be previewed locally
// (http://localhost:8790/GoPeakHQ/#pipe) before the home-PC worker is connected to Supabase.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assign} from './schedule.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const url = (abs) => '/GoPeakPipeline/' + path.relative(ROOT, abs).split(path.sep).join('/');
const poster = (video, jpg, t = 1.2) => {
	if (!fs.existsSync(jpg)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', jpg]);
	return jpg;
};

const clips = [];
const posts = [];
const jobs = fs.readdirSync(OUT).filter((d) => fs.existsSync(path.join(OUT, d, 'manifest.json')));
jobs.forEach((job, k) => {
	const m = JSON.parse(fs.readFileSync(path.join(OUT, job, 'manifest.json'), 'utf8'));
	const face = path.join(ROOT, 'public/jobs', job, 'face.mp4');
	const thumb = fs.existsSync(face) ? poster(face, path.join(OUT, job, '_clip.jpg'), 0.5) : null;
	clips.push({id: job, source_name: path.basename(m.source), kind: 'other', status: 'ready', thumb_url: thumb && url(thumb), created_at: m.createdAt});
	m.variants.forEach((v, i) => {
		const file = path.join(ROOT, v.file);
		posts.push({
			id: `${job}:${v.id}`,
			clip_id: job,
			variant: v.id,
			account: v.account,
			platforms: ['tiktok', 'instagram'],
			hook: (v.text || v.hook || '').split('\n')[0],
			music: v.ref ? `ref @${v.ref.split('/')[0]}` : v.music,
			video_url: url(file),
			thumb_url: url(poster(file, file.replace(/\.mp4$/, '.jpg'))),
			format: v.format || 'talking',
			sound: v.sound || null,
			trial: i !== 2, // preview only: one regular post per clip so both looks show
			status: 'scheduled',
			order: i * jobs.length + k,
		});
	});
});
const slots = ['11:00', '16:00', '20:30'];
assign(posts, slots);
fs.writeFileSync(
	path.join(OUT, 'hq-preview.json'),
	JSON.stringify({settings: {slots, tz: 'America/New_York', autopilot: true, worker_seen_at: new Date().toISOString(), learned: fs.existsSync(path.join(ROOT, 'learned.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'learned.json'), 'utf8')) : {}}, clips, posts}, null, 1),
);
console.log(`preview: ${clips.length} clips, ${posts.length} posts`);
