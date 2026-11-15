import React from 'react';
import {Composition} from 'remotion';
import {Clip, type ClipProps} from './Clip';
import {FPS, H, W} from './safe';

const preview: ClipProps = {
	video: 'jobs/preview/cut.mp4',
	durationSec: 10,
	captions: [],
	hook: 'POV: an app guessed my height at 25 😳📏',
	hookSec: 0,
	music: null,
	musicVolume: 0.12,
	musicStartSec: 0,
	zoom: 1,
	accent: '#FFE14D',
	cta: 'Free height prediction 👉 link in bio',
	ctaSec: 2.5,
};

export const Root: React.FC = () => (
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
);
