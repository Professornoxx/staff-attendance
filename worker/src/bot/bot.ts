import { Bot } from 'grammy';
import type { Env } from '../types';
import { attendanceKeyboard, startOnlyKeyboard } from './keyboard';
import { diffMinutes, diffSeconds, formatMMSS, nowISO, shiftStartToday, todayDate } from '../utils/time';
import {
	applyFine,
	closeBreak,
	createPendingStaff,
	createTodayAttendance,
	getOpenBreak,
	getShift,
	getStaffByTelegramId,
	getTodayAttendance,
	incrementAttendanceBreak,
	openBreak,
	setLogout,
	setStaffState,
} from '../db/queries';

const LATE_FINE_AMOUNT = 500;
const BREAK_FINE_AMOUNT = 500;
const GRACE_MINUTES = 10;
const FULL_DAY_MINUTES = 8 * 60;

export function createBot(env: Env) {
	const bot = new Bot(env.BOT_TOKEN);
	const db = env.DB;

	const handleStart = async (ctx: any) => {
		const telegramId = ctx.from!.id;
		const username = ctx.from!.username ?? null;

		let staff = await getStaffByTelegramId(db, telegramId);

		if (!staff) {
			staff = await createPendingStaff(db, telegramId, username);
			await notifyAdminNewRegistration(ctx, env, staff.id, telegramId, username);
			await ctx.reply('👋 Registration received. Please wait for admin approval before you can use the attendance system.', {
				reply_markup: startOnlyKeyboard,
			});
			return;
		}

		if (staff.status === 'pending') {
			await ctx.reply('⏳ Your registration is still awaiting admin approval.', { reply_markup: startOnlyKeyboard });
			return;
		}

		if (staff.status === 'disabled') {
			await ctx.reply('🚫 Your account has been disabled. Contact your administrator.', { reply_markup: startOnlyKeyboard });
			return;
		}

		await ctx.reply('Welcome back! Use the buttons below to record your attendance.', {
			reply_markup: attendanceKeyboard,
		});
	};

	bot.command('start', handleStart);
	bot.hears('Start', handleStart);

	bot.hears('Login', async (ctx) => {
		const staff = await requireActiveStaff(ctx, db);
		if (!staff) return;

		if (staff.current_state !== 'logged_out') {
			await ctx.reply('⚠️ You are already logged in.');
			return;
		}

		const date = todayDate();
		const now = nowISO();
		const existing = await getTodayAttendance(db, staff.id, date);
		if (existing) {
			await ctx.reply('⚠️ You have already logged in today.');
			return;
		}

		const attendance = await createTodayAttendance(db, staff.id, date, now);
		await setStaffState(db, staff.id, 'logged_in');

		let lateMessage = '';
		if (staff.shift_id) {
			const shift = await getShift(db, staff.shift_id);
			if (shift) {
				const graceDeadline = shiftStartToday(date, shift.start_time);
				graceDeadline.setUTCMinutes(graceDeadline.getUTCMinutes() + GRACE_MINUTES);
				if (new Date(now) > graceDeadline) {
					await applyFine(db, staff.id, attendance.id, 'late', LATE_FINE_AMOUNT, 'Late login', 'late_fine');
					lateMessage = `\n⚠️ Rs.${LATE_FINE_AMOUNT} late login fine applied.`;
				}
			}
		}

		await ctx.reply(`✅ Login recorded successfully.${lateMessage}`);
	});

	bot.hears('Logout', async (ctx) => {
		const staff = await requireActiveStaff(ctx, db);
		if (!staff) return;

		if (staff.current_state !== 'logged_in') {
			await ctx.reply('⚠️ You must be logged in (and not on a break) to logout.');
			return;
		}

		const date = todayDate();
		const attendance = await getTodayAttendance(db, staff.id, date);
		if (!attendance || !attendance.login_time) {
			await ctx.reply('⚠️ No login record found for today.');
			return;
		}

		const now = nowISO();
		const totalMinutes = diffMinutes(attendance.login_time, now) - attendance.total_break_minutes;
		const dayStatus = totalMinutes >= FULL_DAY_MINUTES ? 'full_day' : 'half_day';

		await setLogout(db, attendance.id, now, totalMinutes, dayStatus);
		await setStaffState(db, staff.id, 'logged_out');

		await ctx.reply('✅ Logout recorded successfully.');
	});

	bot.hears('Out', async (ctx) => await handleBreakStart(ctx, db, 'out'));
	bot.hears('Lunch Out', async (ctx) => await handleBreakStart(ctx, db, 'lunch'));
	bot.hears('In', async (ctx) => await handleBreakEnd(ctx, db, env, 'out'));
	bot.hears('Lunch In', async (ctx) => await handleBreakEnd(ctx, db, env, 'lunch'));

	// Catch-all: staff must never type free text — only the reply-keyboard buttons are valid input.
	// This runs last, after every bot.hears()/bot.command() above has had a chance to match.
	bot.on('message:text', async (ctx) => {
		const staff = await getStaffByTelegramId(db, ctx.from!.id);
		const keyboard = staff?.status === 'active' ? attendanceKeyboard : startOnlyKeyboard;
		await ctx.reply('⚠️ Please use the buttons below only — typed messages are not supported.', { reply_markup: keyboard });
	});

	return bot;
}

async function requireActiveStaff(ctx: any, db: D1Database) {
	const staff = await getStaffByTelegramId(db, ctx.from!.id);
	if (!staff || staff.status !== 'active') {
		await ctx.reply('⏳ Your account is not active yet.');
		return null;
	}
	return staff;
}

async function handleBreakStart(ctx: any, db: D1Database, breakType: 'lunch' | 'out') {
	const staff = await requireActiveStaff(ctx, db);
	if (!staff) return;

	if (staff.current_state !== 'logged_in') {
		await ctx.reply('⚠️ You must be logged in (and not already on a break) to start a break.');
		return;
	}

	const date = todayDate();
	const attendance = await getTodayAttendance(db, staff.id, date);
	if (!attendance) {
		await ctx.reply('⚠️ Please login first.');
		return;
	}

	await openBreak(db, attendance.id, breakType, nowISO());
	await setStaffState(db, staff.id, breakType === 'lunch' ? 'on_lunch' : 'on_break');

	const label = breakType === 'lunch' ? 'Lunch' : 'Out/In break';
	await ctx.reply(`${label} started.`);
}

async function handleBreakEnd(ctx: any, db: D1Database, env: Env, breakType: 'lunch' | 'out') {
	const staff = await requireActiveStaff(ctx, db);
	if (!staff) return;

	const expectedState = breakType === 'lunch' ? 'on_lunch' : 'on_break';
	if (staff.current_state !== expectedState) {
		await ctx.reply(`⚠️ You do not have an active ${breakType === 'lunch' ? 'lunch' : 'out'} break to end.`);
		return;
	}

	const date = todayDate();
	const attendance = await getTodayAttendance(db, staff.id, date);
	if (!attendance) {
		await ctx.reply('⚠️ No attendance record found for today.');
		return;
	}

	const open = await getOpenBreak(db, attendance.id, breakType);
	if (!open) {
		await ctx.reply('⚠️ No open break found.');
		return;
	}

	const now = nowISO();
	const durationSeconds = diffSeconds(open.start_time, now);
	const durationMinutes = diffMinutes(open.start_time, now);
	await closeBreak(db, open.id, now, durationMinutes, durationSeconds);
	await incrementAttendanceBreak(db, attendance.id, durationMinutes, durationSeconds);
	await setStaffState(db, staff.id, 'logged_in');

	const updated = await getTodayAttendance(db, staff.id, date);
	const shift = staff.shift_id ? await getShift(db, staff.shift_id) : null;
	const limitSeconds = (shift?.break_limit_minutes ?? 65) * 60;
	const usedSeconds = updated?.total_break_seconds ?? 0;
	const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);

	const label = breakType === 'lunch' ? 'Lunch recorded successfully' : 'Out/In break recorded successfully';

	if (updated && usedSeconds > limitSeconds && updated.break_fine === 0) {
		await applyFine(db, staff.id, updated.id, 'break_exceed', BREAK_FINE_AMOUNT, 'Break limit exceeded', 'break_fine');
		await ctx.reply(`${label}. ⚠️ Break limit exceeded — Rs.${BREAK_FINE_AMOUNT} fine applied.`);
		return;
	}

	await ctx.reply(`${label}. Remaining break time: ${formatMMSS(remainingSeconds)}.`);
}

async function notifyAdminNewRegistration(ctx: any, env: Env, staffId: number, telegramId: number, username: string | null) {
	await ctx.api.sendMessage(
		env.ADMIN_CHAT_ID,
		`🆕 New employee registration:\nUsername: @${username ?? 'unknown'}\nTelegram ID: ${telegramId}\n\nOpen the "New Users" page in the admin dashboard to assign a project, shift, and approve (staff ID: ${staffId}).`
	);
}
