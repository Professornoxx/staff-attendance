const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://attendance-worker.prightpath-attendance.workers.dev';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		...options,
		credentials: 'include',
		headers: {
			'Content-Type': 'application/json',
			...options.headers,
		},
	});

	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
	}

	return res.json() as Promise<T>;
}

export const api = {
	login: (password: string) => request<{ ok: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
	logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

	overview: (date?: string) => request(`/api/dashboard/overview${date ? `?date=${date}` : ''}`),

	charts: (params: { from?: string; to?: string; project_id?: number; shift?: string }) => {
		const q = new URLSearchParams();
		if (params.from) q.set('from', params.from);
		if (params.to) q.set('to', params.to);
		if (params.project_id) q.set('project_id', String(params.project_id));
		if (params.shift) q.set('shift', params.shift);
		return request<ChartsResponse>(`/api/dashboard/charts?${q.toString()}`);
	},

	staff: {
		list: (params?: { shift?: string; status?: string }) => {
			const q = new URLSearchParams();
			if (params?.shift) q.set('shift', params.shift);
			if (params?.status) q.set('status', params.status);
			const qs = q.toString();
			return request<StaffRow[]>(`/api/staff${qs ? `?${qs}` : ''}`);
		},
		update: (id: number, body: Partial<{ shift_id: number; project_id: number; status: string }>) =>
			request(`/api/staff/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
		disable: (id: number) => request(`/api/staff/${id}`, { method: 'DELETE' }),
		approve: (
			id: number,
			body:
				| { project_id: number; shift_id: number }
				| { project_id: number; type: 'day' | 'night'; start_time: string; end_time: string; break_limit_minutes: number }
		) => request(`/api/staff/${id}/approve`, { method: 'POST', body: JSON.stringify(body) }),
		removeFromGroup: (id: number) => request(`/api/staff/${id}/remove-from-group`, { method: 'POST' }),
	},

	shifts: {
		list: (projectId?: number) => request<ShiftRow[]>(`/api/shifts${projectId ? `?project_id=${projectId}` : ''}`),
		create: (body: Omit<ShiftRow, 'id' | 'project_name'>) => request('/api/shifts', { method: 'POST', body: JSON.stringify(body) }),
		update: (id: number, body: Omit<ShiftRow, 'id' | 'project_name'>) =>
			request(`/api/shifts/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
		remove: (id: number) => request(`/api/shifts/${id}`, { method: 'DELETE' }),
	},

	projects: {
		list: () => request<ProjectRow[]>('/api/projects'),
		create: (name: string) => request('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
		update: (id: number, name: string) => request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
		remove: (id: number) => request(`/api/projects/${id}`, { method: 'DELETE' }),
	},

	attendance: {
		list: (date: string, shift?: string) => request<AttendanceRow[]>(`/api/attendance?date=${date}${shift ? `&shift=${shift}` : ''}`),
		history: (staffId: number) => request<AttendanceRow[]>(`/api/attendance/${staffId}`),
	},

	fines: {
		list: (attendanceId: number) => request<FineRow[]>(`/api/fines?attendance_id=${attendanceId}`),
		add: (body: { staff_id: number; attendance_id: number; amount: number; reason: string }) =>
			request('/api/fines', { method: 'POST', body: JSON.stringify(body) }),
		remove: (id: number) => request(`/api/fines/${id}`, { method: 'DELETE' }),
	},

	reports: {
		attendance: (from: string, to: string, shift?: string) =>
			request<Record<string, unknown>[]>(`/api/reports/attendance?from=${from}&to=${to}${shift ? `&shift=${shift}` : ''}`),
		breaks: (from: string, to: string, shift?: string) =>
			request<Record<string, unknown>[]>(`/api/reports/breaks?from=${from}&to=${to}${shift ? `&shift=${shift}` : ''}`),
	},
};

export interface StaffRow {
	id: number;
	telegram_id: number;
	telegram_username: string | null;
	status: string;
	current_state: string;
	created_at: string;
	shift_id: number | null;
	shift_type: string | null;
	start_time: string | null;
	end_time: string | null;
	project_id: number | null;
	project_name: string | null;
}

export interface ShiftRow {
	id: number;
	project_id: number;
	project_name?: string;
	type: 'day' | 'night';
	start_time: string;
	end_time: string;
	break_limit_minutes: number;
}

export interface ProjectRow {
	id: number;
	name: string;
}

export interface AttendanceRow {
	id: number;
	staff_id: number;
	date: string;
	telegram_id: number;
	telegram_username: string;
	current_state: string;
	shift_type: string | null;
	project_name: string | null;
	login_time: string | null;
	logout_time: string | null;
	total_working_minutes: number | null;
	total_break_minutes: number;
	break_count: number;
	day_status: string | null;
	total_fine: number;
}

export interface FineRow {
	id: number;
	staff_id: number;
	attendance_id: number;
	type: 'late' | 'break_exceed' | 'manual';
	amount: number;
	reason: string | null;
	created_at: string;
}

export interface ChartsResponse {
	attendance_trend: { date: string; present: number; late: number; absent: number }[];
	staff_by_project: { project_name: string; count: number }[];
	shift_distribution: { shift_type: 'day' | 'night'; count: number }[];
	fine_summary: { project_name: string; issued_count: number; issued_amount: number; removed_count: number; removed_amount: number }[];
}
