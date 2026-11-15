import React from 'react';
import {Composition} from 'remotion';
import {Clip, type ClipProps} from './Clip';
import {Remake, type RemakeProps} from './Remake';
import {FPS, H, W} from './safe';

const preview: ClipProps = {
	video: 'jobs/preview/cut.mp4',
	durationSec: 10,
	captions: [],
	hook: 'POV: an app guessed my height at 25',
	hookSec: 0,
	music: null,
	musicVolume: 0.12,
	musicStartSec: 0,
	zoom: 1,
	accent: '#FFE14D',
	cta: 'your full prediction in the app, link in bio',
	ctaSec: 2.5,
};

const remakePreview: RemakeProps = {
	face: 'jobs/preview/face.mp4',
	faceLoopSec: 6,
	durationSec: 8,
	audio: 'refaudio/03.m4a',
	texts: [{text: 'Be 6ft with long torso?\n\nOR\n\nBe 5’10 with short torso?', y: 642, w: 828, linePx: 91, to: 4.47}],
	app: {image: 'app/result.png', atSec: 4.47, fadeSec: 0, header: 'Check your result', headerY: 330, y: 1005, width: 640},
	appAspect: 2340 / 1320,
};

export const Root: React.FC = () => (
	<>
	<Composition
		id="Remake"
		component={Remake}
		width={W}
		height={H}
		fps={FPS}
		durationInFrames={FPS * 8}
		defaultProps={remakePreview}
		calculateMetadata={({props}) => ({durationInFrames: Math.max(1, Math.round(props.durationSec * FPS))})}
	/>
	<Composition
		id="Clip"
		component={Clip}
		width={W}
		height={H}
		fps={FPS}
		durationInFrames={FPS * 10}
		defaultProps={preview}
		calculateMetadata={({props}) => ({durationInFrames: Math.max(1, Math.round(props.durationSec * FPS))})}
	/>
	</>
);
