# GoPeak content pipeline

Raw clip of Mav → silence cut → 9:16 → captions (TikTok Sans + Apple emoji) → up to 4 variants
(2 per account, each with a different hook, song, zoom and caption color) → scheduled posts in GoPeak HQ.

## Setup (Mac or Windows PC)
Needs Node 18+ and ffmpeg on PATH (Windows: `winget install Gyan.FFmpeg`).

    npm install
    npm run setup          # Apple emoji font
    npm run make -- input/clip.mov --hooks "hook 1|hook 2|hook 3|hook 4"

First run also builds whisper.cpp + downloads the small.en model (~500 MB) and Chrome Headless Shell.
Output: `out/<clip>/<account>-<n>.mp4` + `manifest.json`.

## Rules baked in
- Text stays inside the 900x1400 safe zone (TikTok/Reels/Shorts UI never covers it). `src/safe.ts`.
- Hook font shrinks with length so it never runs past ~3 lines.
- One clip → max 4 variants, max 2 per account, every variant a different hook + song.
- Landscape footage is blur-filled instead of cropped (no 3x blow-up).
- Music: only royalty-free tracks in `public/music/`. Trending TikTok sounds get added in-app.

## Files
- `src/Clip.tsx` – the video template (hook, word captions, end-card CTA, music)
- `scripts/make.mjs` – the pipeline (cut, crop, captions, variants, render)
