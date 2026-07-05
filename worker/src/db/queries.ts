import type { Attendance, Shift, Staff } from '../types';

export async function getStaffByTelegramId(db: D1Database, telegramId: number): Promise<Staff | null> {
	return db.prepare('SELECT * FROM staff WHERE telegram_id = ?').bind(telegramId).first<Staff>();
}

export async function createPendingStaff(db: D1Database, telegramId: number, username: string | null): Promise<Staff> {
	await db
		.prepare('INSERT INTO staff (telegram_id, telegram_username, status) VALUES (?, ?, ?)')
		.bind(telegramId, username, 'pending')
		.run();
	return (await getStaffByTelegramId(db, telegramId))!;
}

export async function getShift(db: D1Database, shiftId: number): Promise<Shift | null> {
	return db.prepare('SELECT * FROM shifts WHERE id = ?').bind(shiftId).first<Shift>();
}

export async function listProjects(db: D1Database) {
	const res = await db.prepare('SELECT * FROM projects ORDER BY name').all();
	return res.results as { id: number; name: string }[];
}

export async function approveStaff(db: D1Database, staffId: number, shiftId: number, projectId: number) {
	await db
		.prepare("UPDATE staff SET status = 'active', shift_id = ?, project_id = ? WHERE id = ?")
		.bind(shiftId, projectId, staffId)
		.run();
}

// Creates a new shift schedule for a project. Projects can have any number of schedules
// per type (e.g. Day Shift 8-5, Day Shift 9-6), each with its own break limit.
export async function createShift(
	db: D1Database,
	projectId: number,
	type: 'day' | 'night',
	startTime: string,
	endTime: string,
	breakLimitMinutes: number
): Promise<number> {
	const result = await db
		.prepare('INSERT INTO shifts (project_id, type, start_time, end_time, break_limit_minutes) VALUES (?, ?, ?, ?, ?)')
		.bind(projectId, type, startTime, endTime, breakLimitMinutes)
		.run();
	return result.meta.last_row_id as number;
}

export async function getTodayAttendance(db: D1Database, staffId: number, date: string): Promise<Attendance | null> {
	return db.prepare('SELECT * FROM attendance WHERE staff_id = ? AND date = ?').bind(staffId, date).first<Attendance>();
}

export async function createTodayAttendance(db: D1Database, staffId: number, date: string, loginTime: string): Promise<Attendance> {
	await db
		.prepare('INSERT INTO attendance (staff_id, date, login_time) VALUES (?, ?, ?)')
		.bind(staffId, date, loginTime)
		.run();
	return (await getTodayAttendance(db, staffId, date))!;
}

export async function setStaffState(db: D1Database, staffId: number, state: Staff['current_state']) {
	await db.prepare('UPDATE staff SET current_state = ? WHERE id = ?').bind(state, staffId).run();
}

export async function setLogout(
	db: D1Database,
	attendanceId: number,
	logoutTime: string,
	totalWorkingMinutes: number,
	dayStatus: string
) {
	await db
		.prepare('UPDATE attendance SET logout_time = ?, total_working_minutes = ?, day_status = ? WHERE id = ?')
		.bind(logoutTime, totalWorkingMinutes, dayStatus, attendanceId)
		.run();
}

export async function openBreak(db: D1Database, attendanceId: number, breakType: 'lunch' | 'out', startTime: string) {
	await db
		.prepare('INSERT INTO breaks (attendance_id, break_type, start_time) VALUES (?, ?, ?)')
		.bind(attendanceId, breakType, startTime)
		.run();
}

export async function getOpenBreak(db: D1Database, attendanceId: number, breakType: 'lunch' | 'out') {
	return db
		.prepare('SELECT * FROM breaks WHERE attendance_id = ? AND break_type = ? AND end_time IS NULL ORDER BY id DESC LIMIT 1')
		.bind(attendanceId, breakType)
		.first<{ id: number; start_time: string }>();
}

export async function closeBreak(db: D1Database, breakId: number, endTime: string, durationMinutes: number, durationSeconds: number) {
	await db
		.prepare('UPDATE breaks SET end_time = ?, duration_minutes = ?, duration_seconds = ? WHERE id = ?')
		.bind(endTime, durationMinutes, durationSeconds, breakId)
		.run();
}

export async function incrementAttendanceBreak(db: D1Database, attendanceId: number, durationMinutes: number, durationSeconds: number) {
	await db
		.prepare(
			'UPDATE attendance SET total_break_minutes = total_break_minutes + ?, total_break_seconds = total_break_seconds + ?, break_count = break_count + 1 WHERE id = ?'
		)
		.bind(durationMinutes, durationSeconds, attendanceId)
		.run();
}

export async function applyFine(
	db: D1Database,
	staffId: number,
	attendanceId: number,
	type: 'late' | 'break_exceed' | 'manual',
	amount: number,
	reason: string,
	attendanceFineColumn: 'late_fine' | 'break_fine' | 'manual_fine'
) {
	await db
		.prepare('INSERT INTO fines (staff_id, attendance_id, type, amount, reason) VALUES (?, ?, ?, ?, ?)')
		.bind(staffId, attendanceId, type, amount, reason)
		.run();
	await db
		.prepare(`UPDATE attendance SET ${attendanceFineColumn} = ${attendanceFineColumn} + ? WHERE id = ?`)
		.bind(amount, attendanceId)
		.run();
}

// Permanently deletes a staff member and all their attendance/break/fine history.
export async function deleteStaffCompletely(db: D1Database, staffId: number) {
	await db
		.prepare('DELETE FROM breaks WHERE attendance_id IN (SELECT id FROM attendance WHERE staff_id = ?)')
		.bind(staffId)
		.run();
	await db.prepare('DELETE FROM fines WHERE staff_id = ?').bind(staffId).run();
	await db.prepare('DELETE FROM attendance WHERE staff_id = ?').bind(staffId).run();
	await db.prepare('DELETE FROM staff WHERE id = ?').bind(staffId).run();
}
