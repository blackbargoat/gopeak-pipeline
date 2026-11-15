import React from 'react';
import {EMOJI_FONT} from './fonts';

const isEmoji = (g: string) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g);

// Splits text so emoji render from the Apple font WITHOUT the black outline
// (an outline around a color emoji looks muddy), and text keeps its outline.
export const RichText: React.FC<{text: string; textStyle: React.CSSProperties}> = ({text, textStyle}) => {
	const seg = new Intl.Segmenter('en', {granularity: 'grapheme'});
	const parts: {t: string; emoji: boolean}[] = [];
	for (const {segment} of seg.segment(text)) {
		const emoji = isEmoji(segment);
		const last = parts[parts.length - 1];
		if (last && last.emoji === emoji && !emoji) last.t += segment;
		else parts.push({t: segment, emoji});
	}
	return (
		<>
			{parts.map((p, i) =>
				p.emoji ? (
					<span
						key={i}
						style={{
							fontFamily: `'${EMOJI_FONT}'`,
							WebkitTextStroke: 0,
							textShadow: 'none',
							fontSize: '0.92em',
							margin: '0 0.04em',
						}}
					>
						{p.t}
					</span>
				) : (
					<span key={i} style={textStyle}>
						{p.t}
					</span>
				),
			)}
		</>
	);
};
