import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import type { Env } from '../types';

export const authApi = new Hono<{ Bindings: Env }>();

authApi.post('/login', async (c) => {
	const body = await c.req.json<{ password?: string }>().catch(() => ({ password: undefined }));
	if (!body.password || body.password !== c.env.ADMIN_PASSWORD) {
		return c.json({ error: 'Invalid password' }, 401);
	}

	const token = await sign({ role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 }, c.env.SESSION_SECRET);

	setCookie(c, 'session', token, {
		httpOnly: true,
		secure: true,
		sameSite: 'None',
		maxAge: 60 * 60 * 12,
		path: '/',
	});

	return c.json({ ok: true });
});

authApi.post('/logout', async (c) => {
	deleteCookie(c, 'session', { path: '/' });
	return c.json({ ok: true });
});
