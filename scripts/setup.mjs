#!/usr/bin/env node
// One-time setup on a new machine (Mac or Windows): downloads the Apple emoji font build.
// Source: github.com/samuelngs/apple-emoji-linux (MIT build of Apple Color Emoji).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(ROOT, 'public/fonts/AppleColorEmoji-Linux.ttf');
const url = 'https://github.com/samuelngs/apple-emoji-linux/releases/download/macos-26-20260722-484daf4e/AppleColorEmoji-Linux.ttf';
if (fs.existsSync(dest)) { console.log('emoji font already there'); process.exit(0); }
console.log('downloading Apple emoji font (~110 MB)…');
const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
console.log('saved', dest);
