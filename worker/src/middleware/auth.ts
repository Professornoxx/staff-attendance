import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import type { Env } from '../types';

export async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
	const token = getCookie(c, 'session');
	if (!token) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	try {
		await verify(token, c.env.SESSION_SECRET, 'HS256');
	} catch {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	await next();
}
