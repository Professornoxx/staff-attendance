import { Hono } from 'hono';
import type { Env } from '../types';

export const projectsApi = new Hono<{ Bindings: Env }>();

projectsApi.get('/', async (c) => {
	const res = await c.env.DB.prepare('SELECT * FROM projects ORDER BY name').all();
	return c.json(res.results);
});

projectsApi.post('/', async (c) => {
	const body = await c.req.json<{ name: string }>();
	const result = await c.env.DB.prepare('INSERT INTO projects (name) VALUES (?)').bind(body.name).run();
	return c.json({ id: result.meta.last_row_id });
});

projectsApi.put('/:id', async (c) => {
	const id = c.req.param('id');
	const body = await c.req.json<{ name: string }>();
	await c.env.DB.prepare('UPDATE projects SET name = ? WHERE id = ?').bind(body.name, id).run();
	return c.json({ ok: true });
});

projectsApi.delete('/:id', async (c) => {
	const id = c.req.param('id');
	await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
	return c.json({ ok: true });
});
