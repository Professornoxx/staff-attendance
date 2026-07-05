import { Hono } from 'hono';
import type { Env } from '../types';
import { todayDate } from '../utils/time';

export const dashboardApi = new Hono<{ Bindings: Env }>();

dashboardApi.get('/overview', async (c) => {
	const date = c.req.query('date') ?? todayDate();
	const db = c.env.DB;

	const totalStaff = await db.prepare("SELECT COUNT(*) as n FROM staff WHERE status = 'active'").first<{ n: number }>();
	const activeNow = await db
		.prepare("SELECT COUNT(*) as n FROM staff WHERE status = 'active' AND current_state != 'logged_out'")
		.first<{ n: number }>();
	const todayAttendance = await db.prepare('SELECT COUNT(*) as n FROM attendance WHERE date = ?').bind(date).first<{ n: number }>();
	const fines = await db
		.prepare(
			`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM fines f
			 JOIN attendance a ON f.attendance_id = a.id WHERE a.date = ? AND f.removed_at IS NULL`
		)
		.bind(date)
		.first<{ count: number; total: number }>();

	return c.json({
		total_staff: totalStaff?.n ?? 0,
		active_now: activeNow?.n ?? 0,
		today_attendance_count: todayAttendance?.n ?? 0,
		today_fine_count: fines?.count ?? 0,
		today_fine_amount: fines?.total ?? 0,
	});
});

dashboardApi.get('/charts', async (c) => {
	const db = c.env.DB;
	const to = c.req.query('to') ?? todayDate();
	const fromDefault = (() => {
		const d = new Date(to);
		d.setDate(d.getDate() - 29);
		return d.toISOString().slice(0, 10);
	})();
	const from = c.req.query('from') ?? fromDefault;
	const projectId = c.req.query('project_id');
	const shiftType = c.req.query('shift');

	const staffFilterConditions: string[] = ["s.status = 'active'"];
	const staffFilterBinds: string[] = [];
	if (projectId) {
		staffFilterConditions.push('s.project_id = ?');
		staffFilterBinds.push(projectId);
	}
	if (shiftType) {
		staffFilterConditions.push('sh.type = ?');
		staffFilterBinds.push(shiftType);
	}
	const staffFilterSql = staffFilterConditions.join(' AND ');

	// Total active staff matching the filters (used to compute "absent" per day).
	const totalStaffRow = await db
		.prepare(`SELECT COUNT(*) as n FROM staff s LEFT JOIN shifts sh ON s.shift_id = sh.id WHERE ${staffFilterSql}`)
		.bind(...staffFilterBinds)
		.first<{ n: number }>();
	const totalStaff = totalStaffRow?.n ?? 0;

	// 1. Attendance trend: present / late per day, absent derived from totalStaff.
	const attendanceConditions: string[] = ['a.date BETWEEN ? AND ?'];
	const attendanceBinds: string[] = [from, to];
	if (projectId) {
		attendanceConditions.push('s.project_id = ?');
		attendanceBinds.push(projectId);
	}
	if (shiftType) {
		attendanceConditions.push('sh.type = ?');
		attendanceBinds.push(shiftType);
	}
	const attendanceRows = await db
		.prepare(
			`SELECT a.date,
				COUNT(DISTINCT a.staff_id) as present,
				COUNT(DISTINCT CASE WHEN a.late_fine > 0 THEN a.staff_id END) as late
			 FROM attendance a
			 JOIN staff s ON a.staff_id = s.id
			 LEFT JOIN shifts sh ON s.shift_id = sh.id
			 WHERE ${attendanceConditions.join(' AND ')}
			 GROUP BY a.date`
		)
		.bind(...attendanceBinds)
		.all<{ date: string; present: number; late: number }>();

	const attendanceByDate = new Map(attendanceRows.results.map((r) => [r.date, r]));
	const attendanceTrend: { date: string; present: number; late: number; absent: number }[] = [];
	for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) {
		const dateStr = d.toISOString().slice(0, 10);
		const row = attendanceByDate.get(dateStr);
		const present = row?.present ?? 0;
		attendanceTrend.push({
			date: dateStr,
			present,
			late: row?.late ?? 0,
			absent: Math.max(0, totalStaff - present),
		});
	}

	// 2. Staff distribution by project.
	const staffByProject = await db
		.prepare(
			`SELECT p.name as project_name, COUNT(*) as count
			 FROM staff s
			 JOIN projects p ON s.project_id = p.id
			 LEFT JOIN shifts sh ON s.shift_id = sh.id
			 WHERE ${staffFilterSql}
			 GROUP BY p.name
			 ORDER BY p.name`
		)
		.bind(...staffFilterBinds)
		.all();

	// 3. Day vs Night distribution (shift filter intentionally not applied here — this chart IS the shift split).
	const shiftDistConditions: string[] = ["s.status = 'active'"];
	const shiftDistBinds: string[] = [];
	if (projectId) {
		shiftDistConditions.push('s.project_id = ?');
		shiftDistBinds.push(projectId);
	}
	const shiftDistribution = await db
		.prepare(
			`SELECT sh.type as shift_type, COUNT(*) as count
			 FROM staff s
			 JOIN shifts sh ON s.shift_id = sh.id
			 WHERE ${shiftDistConditions.join(' AND ')}
			 GROUP BY sh.type`
		)
		.bind(...shiftDistBinds)
		.all();

	// 4. Fine summary by project: issued vs removed, within the date range (by attendance date).
	const fineConditions: string[] = ['a.date BETWEEN ? AND ?'];
	const fineBinds: string[] = [from, to];
	if (projectId) {
		fineConditions.push('s.project_id = ?');
		fineBinds.push(projectId);
	}
	if (shiftType) {
		fineConditions.push('sh.type = ?');
		fineBinds.push(shiftType);
	}
	const fineSummary = await db
		.prepare(
			`SELECT p.name as project_name,
				COUNT(f.id) as issued_count,
				COALESCE(SUM(f.amount),0) as issued_amount,
				COUNT(CASE WHEN f.removed_at IS NOT NULL THEN f.id END) as removed_count,
				COALESCE(SUM(CASE WHEN f.removed_at IS NOT NULL THEN f.amount ELSE 0 END),0) as removed_amount
			 FROM fines f
			 JOIN attendance a ON f.attendance_id = a.id
			 JOIN staff s ON f.staff_id = s.id
			 LEFT JOIN shifts sh ON s.shift_id = sh.id
			 LEFT JOIN projects p ON s.project_id = p.id
			 WHERE ${fineConditions.join(' AND ')}
			 GROUP BY p.name
			 ORDER BY p.name`
		)
		.bind(...fineBinds)
		.all();

	return c.json({
		attendance_trend: attendanceTrend,
		staff_by_project: staffByProject.results,
		shift_distribution: shiftDistribution.results,
		fine_summary: fineSummary.results,
	});
});
