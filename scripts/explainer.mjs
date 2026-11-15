#!/usr/bin/env node
// Renders the GoPeak animated explainer (faceless). Usage: node scripts/explainer.mjs [props.json] [out.mp4]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const props = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : {};
const out = process.argv[3] || path.join(ROOT, 'out/explainer/explainer-1.mp4');
fs.mkdirSync(path.dirname(out), {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public')});
const composition = await selectComposition({serveUrl, id: 'Explainer', inputProps: props});
await renderMedia({composition, serveUrl, codec: 'h264', crf: 18, outputLocation: out, inputProps: props});
console.log('done', out);
