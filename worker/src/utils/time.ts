export function nowISO(): string {
	return new Date().toISOString();
}

export function todayDate(): string {
	return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function diffMinutes(startISO: string, endISO: string): number {
	const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
	return Math.max(0, Math.round(ms / 60000));
}

export function diffSeconds(startISO: string, endISO: string): number {
	const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
	return Math.max(0, Math.round(ms / 1000));
}

// Formats a total number of seconds as "MM:SS" (minutes not zero-padded, seconds always 2 digits).
export function formatMMSS(totalSeconds: number): string {
	const clamped = Math.max(0, totalSeconds);
	const minutes = Math.floor(clamped / 60);
	const seconds = clamped % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Combines today's date with a shift "HH:MM" time into a comparable Date
export function shiftStartToday(date: string, hhmm: string): Date {
	const [h, m] = hhmm.split(':').map(Number);
	const d = new Date(`${date}T00:00:00.000Z`);
	d.setUTCHours(h, m, 0, 0);
	return d;
}
