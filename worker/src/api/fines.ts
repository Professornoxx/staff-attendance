import { Hono } from 'hono';
import type { Env } from '../types';

export const finesApi = new Hono<{ Bindings: Env }>();

async function notifyStaff(env: Env, staffId: number, message: string) {
	const staff = await env.DB.prepare('SELECT telegram_id FROM staff WHERE id = ?').bind(staffId).first<{ telegram_id: number }>();
	if (!staff) return;
	await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: staff.telegram_id, text: message }),
	});
}

finesApi.get('/', async (c) => {
	const attendanceId = c.req.query('attendance_id');
	if (!attendanceId) return c.json({ error: 'attendance_id query param is required' }, 400);

	const res = await c.env.DB.prepare('SELECT * FROM fines WHERE attendance_id = ? AND removed_at IS NULL ORDER BY created_at DESC')
		.bind(attendanceId)
		.all();
	return c.json(res.results);
});

finesApi.post('/', async (c) => {
	const body = await c.req.json<{ staff_id: number; attendance_id: number; amount: number; reason: string }>();

	await c.env.DB.prepare('INSERT INTO fines (staff_id, attendance_id, type, amount, reason) VALUES (?, ?, ?, ?, ?)')
		.bind(body.staff_id, body.attendance_id, 'manual', body.amount, body.reason)
		.run();

	await c.env.DB.prepare('UPDATE attendance SET manual_fine = manual_fine + ? WHERE id = ?')
		.bind(body.amount, body.attendance_id)
		.run();

	await notifyStaff(c.env, body.staff_id, `⚠️ A fine of Rs.${body.amount} has been applied: ${body.reason}`);

	return c.json({ ok: true });
});

finesApi.delete('/:id', async (c) => {
	const id = c.req.param('id');
	const fine = await c.env.DB.prepare('SELECT * FROM fines WHERE id = ?').bind(id).first<{
		id: number;
		staff_id: number;
		attendance_id: number;
		amount: number;
		type: string;
	}>();
	if (!fine) return c.json({ error: 'Not found' }, 404);

	const column = fine.type === 'late' ? 'late_fine' : fine.type === 'break_exceed' ? 'break_fine' : 'manual_fine';
	await c.env.DB.prepare(`UPDATE attendance SET ${column} = ${column} - ? WHERE id = ?`).bind(fine.amount, fine.attendance_id).run();
	// Soft-delete: keep the row (with removed_at set) so reporting can still show it was issued and later removed.
	await c.env.DB.prepare("UPDATE fines SET removed_at = datetime('now') WHERE id = ?").bind(id).run();

	await notifyStaff(
		c.env,
		fine.staff_id,
		'✅ Your attendance fine has been removed by the Admin. If you have any questions, please contact your supervisor.'
	);

	return c.json({ ok: true });
});
