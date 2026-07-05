import { Hono } from 'hono';
import type { Env } from '../types';

export const reportsApi = new Hono<{ Bindings: Env }>();

reportsApi.get('/attendance', async (c) => {
	const from = c.req.query('from');
	const to = c.req.query('to');
	const shift = c.req.query('shift');
	if (!from || !to) return c.json({ error: 'from and to query params are required' }, 400);

	let query = `
		SELECT
			a.date,
			s.telegram_id,
			s.telegram_username as employee_name,
			p.name as project_name,
			a.login_time,
			a.logout_time,
			a.total_working_minutes,
			(SELECT COALESCE(SUM(duration_minutes),0) FROM breaks WHERE attendance_id = a.id AND break_type = 'lunch') as lunch_break_minutes,
			(SELECT COALESCE(SUM(duration_minutes),0) FROM breaks WHERE attendance_id = a.id AND break_type = 'out') as out_break_minutes,
			a.total_break_minutes,
			a.break_count,
			sh.type as shift,
			(a.late_fine + a.break_fine + a.manual_fine) as fine_amount,
			a.day_status
		FROM attendance a
		JOIN staff s ON a.staff_id = s.id
		LEFT JOIN shifts sh ON s.shift_id = sh.id
		LEFT JOIN projects p ON s.project_id = p.id
		WHERE a.date BETWEEN ? AND ?
	`;
	const binds: string[] = [from, to];
	if (shift) {
		query += ' AND sh.type = ?';
		binds.push(shift);
	}
	query += ' ORDER BY a.date, s.telegram_username';

	const res = await c.env.DB.prepare(query)
		.bind(...binds)
		.all();

	return c.json(res.results);
});

reportsApi.get('/breaks', async (c) => {
	const from = c.req.query('from');
	const to = c.req.query('to');
	const shift = c.req.query('shift');
	if (!from || !to) return c.json({ error: 'from and to query params are required' }, 400);

	let attendanceQuery = `
		SELECT a.id, a.date, s.telegram_username as employee_name, a.total_break_minutes, a.break_fine, sh.type as shift_type
		FROM attendance a
		JOIN staff s ON a.staff_id = s.id
		LEFT JOIN shifts sh ON s.shift_id = sh.id
		WHERE a.date BETWEEN ? AND ?
	`;
	const attendanceBinds: string[] = [from, to];
	if (shift) {
		attendanceQuery += ' AND sh.type = ?';
		attendanceBinds.push(shift);
	}
	attendanceQuery += ' ORDER BY a.date, s.telegram_username';

	const attendanceRows = await c.env.DB.prepare(attendanceQuery)
		.bind(...attendanceBinds)
		.all<{ id: number; date: string; employee_name: string; total_break_minutes: number; break_fine: number }>();

	if (attendanceRows.results.length === 0) return c.json([]);

	const attendanceIds = attendanceRows.results.map((a) => a.id);
	const placeholders = attendanceIds.map(() => '?').join(',');
	const breaksRes = await c.env.DB.prepare(
		`SELECT attendance_id, break_type, start_time, end_time, duration_minutes FROM breaks
		 WHERE attendance_id IN (${placeholders})
		 ORDER BY attendance_id, start_time`
	)
		.bind(...attendanceIds)
		.all<{ attendance_id: number; break_type: string; start_time: string; end_time: string | null; duration_minutes: number | null }>();

	const breaksByAttendance = new Map<number, typeof breaksRes.results>();
	for (const b of breaksRes.results) {
		const list = breaksByAttendance.get(b.attendance_id) ?? [];
		list.push(b);
		breaksByAttendance.set(b.attendance_id, list);
	}

	// Pivot: each row gets break_1, break_2, ... columns (out/in breaks) plus a separate lunch column
	const rows = attendanceRows.results.map((a) => {
		const breaks = breaksByAttendance.get(a.id) ?? [];
		const outBreaks = breaks.filter((b) => b.break_type === 'out');
		const lunchBreaks = breaks.filter((b) => b.break_type === 'lunch');

		const row: Record<string, unknown> = {
			date: a.date,
			employee_name: a.employee_name,
		};

		outBreaks.forEach((b, i) => {
			row[`break_${i + 1}`] = b.end_time ? `${b.start_time} - ${b.end_time} (${b.duration_minutes}m)` : `${b.start_time} (ongoing)`;
		});

		row['lunch_break'] = lunchBreaks
			.map((b) => (b.end_time ? `${b.start_time} - ${b.end_time} (${b.duration_minutes}m)` : `${b.start_time} (ongoing)`))
			.join(', ');
		row['total_break_minutes'] = a.total_break_minutes;
		row['fine_applied'] = a.break_fine > 0;

		return row;
	});

	return c.json(rows);
});
