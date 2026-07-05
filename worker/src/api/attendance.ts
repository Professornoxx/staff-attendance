import { Hono } from 'hono';
import type { Env } from '../types';
import { todayDate } from '../utils/time';

export const attendanceApi = new Hono<{ Bindings: Env }>();

attendanceApi.get('/', async (c) => {
	const date = c.req.query('date') ?? todayDate();
	const shiftType = c.req.query('shift');

	let query = `
		SELECT a.*, s.telegram_id, s.telegram_username, s.current_state,
		       sh.type as shift_type, p.name as project_name,
		       (a.late_fine + a.break_fine + a.manual_fine) as total_fine
		FROM attendance a
		JOIN staff s ON a.staff_id = s.id
		LEFT JOIN shifts sh ON s.shift_id = sh.id
		LEFT JOIN projects p ON s.project_id = p.id
		WHERE a.date = ?
	`;
	const binds: string[] = [date];
	if (shiftType) {
		query += ' AND sh.type = ?';
		binds.push(shiftType);
	}
	query += ' ORDER BY a.login_time';

	const res = await c.env.DB.prepare(query)
		.bind(...binds)
		.all();
	return c.json(res.results);
});

attendanceApi.get('/:staffId', async (c) => {
	const staffId = c.req.param('staffId');
	const res = await c.env.DB.prepare('SELECT * FROM attendance WHERE staff_id = ? ORDER BY date DESC').bind(staffId).all();
	return c.json(res.results);
});
