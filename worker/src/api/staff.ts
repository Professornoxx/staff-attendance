import { Hono } from 'hono';
import type { Env } from '../types';
import { approveStaff, createShift, deleteStaffCompletely } from '../db/queries';

export const staffApi = new Hono<{ Bindings: Env }>();

const LIST_QUERY = `
	SELECT s.id, s.telegram_id, s.telegram_username, s.status, s.current_state, s.created_at,
	       sh.id as shift_id, sh.type as shift_type, sh.start_time, sh.end_time,
	       p.id as project_id, p.name as project_name
	FROM staff s
	LEFT JOIN shifts sh ON s.shift_id = sh.id
	LEFT JOIN projects p ON s.project_id = p.id
`;

staffApi.get('/', async (c) => {
	const shiftType = c.req.query('shift');
	const status = c.req.query('status');

	const conditions: string[] = [];
	const binds: string[] = [];
	if (shiftType) {
		conditions.push('sh.type = ?');
		binds.push(shiftType);
	}
	if (status) {
		conditions.push('s.status = ?');
		binds.push(status);
	}

	let query = LIST_QUERY;
	if (conditions.length > 0) {
		query += ' WHERE ' + conditions.join(' AND ');
	}
	query += ' ORDER BY s.id';

	const res = await c.env.DB.prepare(query)
		.bind(...binds)
		.all();
	return c.json(res.results);
});

staffApi.get('/:id', async (c) => {
	const id = c.req.param('id');
	const row = await c.env.DB.prepare(`${LIST_QUERY} WHERE s.id = ?`).bind(id).first();
	if (!row) return c.json({ error: 'Not found' }, 404);
	return c.json(row);
});

staffApi.post('/:id/approve', async (c) => {
	const id = Number(c.req.param('id'));
	const body = await c.req.json<{
		project_id: number;
		shift_id?: number;
		type?: 'day' | 'night';
		start_time?: string;
		end_time?: string;
		break_limit_minutes?: number;
	}>();

	if (!body.project_id) {
		return c.json({ error: 'project_id is required' }, 400);
	}

	let shiftId: number;
	if (body.shift_id) {
		// Assign to an existing schedule for this project.
		shiftId = body.shift_id;
	} else {
		// Create a new schedule for this project.
		if (!body.type || !body.start_time || !body.end_time || !body.break_limit_minutes) {
			return c.json(
				{ error: 'Either shift_id (existing schedule) or type, start_time, end_time and break_limit_minutes (new schedule) are required' },
				400
			);
		}
		shiftId = await createShift(c.env.DB, body.project_id, body.type, body.start_time, body.end_time, body.break_limit_minutes);
	}

	await approveStaff(c.env.DB, id, shiftId, body.project_id);

	const staffRow = await c.env.DB.prepare('SELECT telegram_id FROM staff WHERE id = ?').bind(id).first<{ telegram_id: number }>();
	if (staffRow) {
		await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/sendMessage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: staffRow.telegram_id,
				text: '✅ You have been approved! Tap Start to begin using the attendance system.',
			}),
		});
	}

	return c.json({ ok: true, shift_id: shiftId });
});

staffApi.put('/:id', async (c) => {
	const id = c.req.param('id');
	const body = await c.req.json<{ shift_id?: number; project_id?: number; status?: string }>();

	const fields: string[] = [];
	const binds: (string | number)[] = [];
	if (body.shift_id !== undefined) {
		fields.push('shift_id = ?');
		binds.push(body.shift_id);
	}
	if (body.project_id !== undefined) {
		fields.push('project_id = ?');
		binds.push(body.project_id);
	}
	if (body.status !== undefined) {
		fields.push('status = ?');
		binds.push(body.status);
	}
	if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);

	binds.push(id);
	await c.env.DB.prepare(`UPDATE staff SET ${fields.join(', ')} WHERE id = ?`)
		.bind(...binds)
		.run();
	return c.json({ ok: true });
});

staffApi.delete('/:id', async (c) => {
	const id = c.req.param('id');
	await c.env.DB.prepare("UPDATE staff SET status = 'disabled' WHERE id = ?").bind(id).run();
	return c.json({ ok: true });
});

// Kicks the staff member from the shared Telegram group (best-effort — proceeds even if they
// were never a group member) and then PERMANENTLY deletes their staff record, attendance,
// breaks, and fines. This is irreversible.
staffApi.post('/:id/remove-from-group', async (c) => {
	const id = Number(c.req.param('id'));
	const staffRow = await c.env.DB.prepare('SELECT telegram_id FROM staff WHERE id = ?').bind(id).first<{ telegram_id: number }>();
	if (!staffRow) return c.json({ error: 'Not found' }, 404);

	let groupRemovalNote = '';

	if (!c.env.STAFF_GROUP_CHAT_ID) {
		groupRemovalNote = 'STAFF_GROUP_CHAT_ID is not configured — skipped group removal.';
	} else {
		const banRes = await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/banChatMember`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: c.env.STAFF_GROUP_CHAT_ID, user_id: staffRow.telegram_id }),
		});
		const banBody = await banRes.json<{ ok: boolean; description?: string }>();
		if (banBody.ok) {
			await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/unbanChatMember`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: c.env.STAFF_GROUP_CHAT_ID, user_id: staffRow.telegram_id, only_if_banned: true }),
			});
		} else {
			groupRemovalNote = banBody.description ?? 'Failed to remove from group';
		}
	}

	await deleteStaffCompletely(c.env.DB, id);

	return c.json({ ok: true, group_removal_note: groupRemovalNote || undefined });
});
