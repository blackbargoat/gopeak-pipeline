import React from 'react';
import {Composition} from 'remotion';
import {Clip, type ClipProps} from './Clip';
import {Remake, type RemakeProps} from './Remake';
import {Explainer, type ExplainerProps} from './Explainer';
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

export const explainerDefault: ExplainerProps = {
	durationSec: 28,
	audio: 'music/gaining-season.mp3',
	people: [
		{label: 'mom', inches: 66},
		{label: 'dad', inches: 70},
		{label: 'him · 16', inches: 73, color: '#141416', key: true},
	],
	compare: {label: 'nba avg', inches: 78, color: '#d6d6db'},
	title: 'How is he 6’1” at 16?',
	sub: 'mom 5’6” · dad 5’10”',
	rangeCenter: 70.5,
	stamp: 'above his genes',
	scenes: [
		{at: 0, label: 'the question', text: ''},
		{at: 3.5, label: 'the genes', text: 'Add mom and dad,\nplus 5 inches for a boy.\nHalf of that is his target.', show: 'range'},
		{at: 7.5, label: 'the target', text: '5’10½”,\ngive or take 4 inches.', show: 'range'},
		{at: 11, label: 'the twist', text: 'He’s already 6’1”.\n2½ inches above it.', show: 'past'},
		{at: 15, label: 'for scale', text: 'The average NBA player\nis about 6’6”.', show: 'compare'},
		{at: 18.5, label: 'what you control', text: '', show: 'three'},
		{at: 23, label: 'your turn', text: '', show: 'cta'},
	],
	three: [
		{big: '8–10 h', small: 'sleep'},
		{big: '1,300 mg', small: 'calcium'},
		{big: '52 g', small: 'protein'},
	],
	cta: {title: 'Comment your age\n+ height', sub: 'I’ll tell you where you land.', typed: '15 · 5’7”', image: 'app/home_peek.png'},
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
		id="Explainer"
		component={Explainer}
		width={W}
		height={H}
		fps={FPS}
		durationInFrames={FPS * 26}
		defaultProps={explainerDefault}
		calculateMetadata={({props}) => ({durationInFrames: Math.max(1, Math.round(props.durationSec * FPS))})}
	/>
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
