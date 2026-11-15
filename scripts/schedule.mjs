// Slot scheduler shared by the HQ preview and the home-PC worker.
// 3 slots per account per day (pipe_settings.slots, local times in America/New_York).
// Rules: a slot holds one post; two uses of the same clip on the same account are >= 2 days apart;
// the same clip never posts on both accounts the same day.

const TZ = 'America/New_York';

// UTC instant for a wall-clock time in TZ (handles DST by checking the zone's offset on that day).
export function zoned(dateStr, hhmm, tz = TZ) {
	const [h, m] = hhmm.split(':').map(Number);
	const guess = new Date(`${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
	const fmt = new Intl.DateTimeFormat('en-US', {timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
	const p = Object.fromEntries(fmt.formatToParts(guess).map((x) => [x.type, x.value]));
	const asTz = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
	return new Date(guess.getTime() - (asTz - guess.getTime()));
}

const dayKey = (d, tz = TZ) => new Intl.DateTimeFormat('en-CA', {timeZone: tz}).format(d);

export function upcomingSlots(slots, days = 14, from = new Date(), tz = TZ) {
	const out = [];
	for (let i = 0; i < days; i++) {
		const day = dayKey(new Date(from.getTime() + i * 864e5), tz);
		for (const s of slots) {
			const at = zoned(day, s, tz);
			if (at > from) out.push({day, at});
		}
	}
	return out;
}

// posts: [{id, clip_id, account, scheduled_at?}] -> fills scheduled_at for the ones without one.
export function assign(posts, slots, {tz = TZ, from = new Date(), minGapDays = 2} = {}) {
	const taken = new Set(posts.filter((p) => p.scheduled_at).map((p) => `${p.account}|${new Date(p.scheduled_at).toISOString()}`));
	const placed = posts.filter((p) => p.scheduled_at).map((p) => ({...p, at: new Date(p.scheduled_at)}));
	const free = upcomingSlots(slots, 30, from, tz);
	const todo = posts.filter((p) => !p.scheduled_at);
	// alternate clips so one clip's variants spread out
	todo.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	for (const p of todo) {
		for (const s of free) {
			const key = `${p.account}|${s.at.toISOString()}`;
			if (taken.has(key)) continue;
			const clash = placed.some(
				(q) =>
					q.clip_id === p.clip_id &&
					((q.account === p.account && Math.abs(q.at - s.at) < minGapDays * 864e5) || (q.account !== p.account && dayKey(q.at, tz) === s.day)),
			);
			if (clash) continue;
			taken.add(key);
			p.scheduled_at = s.at.toISOString();
			placed.push({...p, at: s.at});
			break;
		}
	}
	return posts;
}
