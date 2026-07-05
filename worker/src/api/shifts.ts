import { Hono } from 'hono';
import type { Env } from '../types';

export const shiftsApi = new Hono<{ Bindings: Env }>();

shiftsApi.get('/', async (c) => {
	const projectId = c.req.query('project_id');
	let query = `
		SELECT sh.*, p.name as project_name
		FROM shifts sh
		JOIN projects p ON sh.project_id = p.id
	`;
	const binds: string[] = [];
	if (projectId) {
		query += ' WHERE sh.project_id = ?';
		binds.push(projectId);
	}
	query += ' ORDER BY p.name, sh.type, sh.start_time';

	const res = await c.env.DB.prepare(query)
		.bind(...binds)
		.all();
	return c.json(res.results);
});

shiftsApi.post('/', async (c) => {
	const body = await c.req.json<{
		project_id: number;
		type: 'day' | 'night';
		start_time: string;
		end_time: string;
		break_limit_minutes: number;
	}>();

	if (!body.project_id) {
		return c.json({ error: 'project_id is required — each shift belongs to a project' }, 400);
	}

	const result = await c.env.DB.prepare(
		'INSERT INTO shifts (project_id, type, start_time, end_time, break_limit_minutes) VALUES (?, ?, ?, ?, ?)'
	)
		.bind(body.project_id, body.type, body.start_time, body.end_time, body.break_limit_minutes)
		.run();
	return c.json({ id: result.meta.last_row_id });
});

shiftsApi.put('/:id', async (c) => {
	const id = c.req.param('id');
	const body = await c.req.json<{
		project_id: number;
		type: 'day' | 'night';
		start_time: string;
		end_time: string;
		break_limit_minutes: number;
	}>();
	await c.env.DB.prepare(
		'UPDATE shifts SET project_id = ?, type = ?, start_time = ?, end_time = ?, break_limit_minutes = ? WHERE id = ?'
	)
		.bind(body.project_id, body.type, body.start_time, body.end_time, body.break_limit_minutes, id)
		.run();
	return c.json({ ok: true });
});

shiftsApi.delete('/:id', async (c) => {
	const id = c.req.param('id');
	await c.env.DB.prepare('DELETE FROM shifts WHERE id = ?').bind(id).run();
	return c.json({ ok: true });
});
