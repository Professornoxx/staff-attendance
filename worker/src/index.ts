import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { webhookCallback } from 'grammy';
import type { Env } from './types';
import { createBot } from './bot/bot';
import { authApi } from './api/auth';
import { staffApi } from './api/staff';
import { shiftsApi } from './api/shifts';
import { projectsApi } from './api/projects';
import { attendanceApi } from './api/attendance';
import { finesApi } from './api/fines';
import { reportsApi } from './api/reports';
import { dashboardApi } from './api/dashboard';

const app = new Hono<{ Bindings: Env }>();

const ALLOWED_ORIGIN_SUFFIX = '.attendance-dashboard-cq0.pages.dev';
const ALLOWED_ORIGIN_EXACT = 'https://attendance-dashboard-cq0.pages.dev';

app.use(
	'/api/*',
	cors({
		origin: (origin) => (origin === ALLOWED_ORIGIN_EXACT || origin?.endsWith(ALLOWED_ORIGIN_SUFFIX) ? origin : undefined),
		credentials: true,
	})
);

app.get('/', (c) => c.text('Attendance system worker is running.'));

app.route('/api/auth', authApi);

app.route('/api/staff', staffApi);
app.route('/api/shifts', shiftsApi);
app.route('/api/projects', projectsApi);
app.route('/api/attendance', attendanceApi);
app.route('/api/fines', finesApi);
app.route('/api/reports', reportsApi);
app.route('/api/dashboard', dashboardApi);

app.post('/telegram-webhook', async (c) => {
	const bot = createBot(c.env);
	const handler = webhookCallback(bot, 'hono');
	return handler(c);
});

// One-time setup route: registers this Worker's URL as the Telegram webhook.
// Uses the BOT_TOKEN binding server-side so the token never appears in a terminal command.
app.get('/setup/register-webhook', async (c) => {
	const url = new URL(c.req.url);
	const webhookUrl = `${url.origin}/telegram-webhook`;
	const res = await fetch(`https://api.telegram.org/bot${c.env.BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
	const body = await res.json();
	return c.json(body);
});

export default {
	fetch: app.fetch,

	async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - 30);
		const cutoffDate = cutoff.toISOString().slice(0, 10);

		await env.DB.prepare(
			`DELETE FROM breaks WHERE attendance_id IN (SELECT id FROM attendance WHERE date < ?)`
		)
			.bind(cutoffDate)
			.run();

		await env.DB.prepare(
			`DELETE FROM fines WHERE attendance_id IN (SELECT id FROM attendance WHERE date < ?)`
		)
			.bind(cutoffDate)
			.run();

		await env.DB.prepare(`DELETE FROM attendance WHERE date < ?`).bind(cutoffDate).run();
	},
} satisfies ExportedHandler<Env>;
