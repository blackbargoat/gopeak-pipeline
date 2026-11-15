// 1080x1920 frame. Everything the viewer must read lives inside SAFE.
// 900x1400 centered = the area TikTok, Reels and Shorts all leave uncovered
// (top bar, right-side buttons, bottom caption/username block).
export const W = 1080;
export const H = 1920;
export const FPS = 30;

export const SAFE = {
	left: 90,
	right: 90,
	top: 260,
	bottom: 260,
	width: 900,
	height: 1400,
};

// TikTok's like/comment/share column sits on the right from ~y 900 to ~y 1650.
// Captions near that height stay narrower than the full safe width.
export const CAPTION_MAX_WIDTH = 780;
export const CAPTION_CENTER_Y = 1240;
