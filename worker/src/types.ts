export interface Env {
	DB: D1Database;
	BOT_TOKEN: string;
	ADMIN_CHAT_ID: string;
	ADMIN_PASSWORD: string;
	SESSION_SECRET: string;
	STAFF_GROUP_CHAT_ID: string;
}

export interface Staff {
	id: number;
	telegram_id: number;
	telegram_username: string | null;
	status: 'pending' | 'active' | 'disabled';
	shift_id: number | null;
	project_id: number | null;
	current_state: 'logged_out' | 'logged_in' | 'on_lunch' | 'on_break';
}

export interface Shift {
	id: number;
	project_id: number;
	type: 'day' | 'night';
	start_time: string;
	end_time: string;
	break_limit_minutes: number;
}

export interface Attendance {
	id: number;
	staff_id: number;
	date: string;
	login_time: string | null;
	logout_time: string | null;
	total_working_minutes: number | null;
	total_break_minutes: number;
	total_break_seconds: number;
	break_count: number;
	day_status: string | null;
	late_fine: number;
	break_fine: number;
	manual_fine: number;
}
