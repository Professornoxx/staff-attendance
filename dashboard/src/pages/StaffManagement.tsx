import { useEffect, useState } from 'react';
import { api, type ProjectRow, type ShiftRow, type StaffRow } from '../lib/api';

interface EditForm {
	project_id: number;
	shift_id: number;
	status: string;
}

export default function StaffManagement() {
	const [staff, setStaff] = useState<StaffRow[]>([]);
	const [projects, setProjects] = useState<ProjectRow[]>([]);
	const [shifts, setShifts] = useState<ShiftRow[]>([]);
	const [search, setSearch] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [editing, setEditing] = useState<StaffRow | null>(null);
	const [form, setForm] = useState<EditForm>({ project_id: 0, shift_id: 0, status: 'active' });
	const [error, setError] = useState('');
	const [groupMessage, setGroupMessage] = useState<Record<number, string>>({});

	function load() {
		api.staff.list().then(setStaff);
		api.projects.list().then(setProjects);
		api.shifts.list().then(setShifts);
	}
	useEffect(load, []);

	function openEdit(s: StaffRow) {
		setEditing(s);
		setError('');
		setForm({ project_id: s.project_id ?? 0, shift_id: s.shift_id ?? 0, status: s.status });
		// Refetch so any schedules added on the Shift Management page since this page loaded are included.
		api.shifts.list().then(setShifts);
		api.projects.list().then(setProjects);
	}

	async function saveEdit() {
		if (!editing) return;
		setError('');
		try {
			await api.staff.update(editing.id, { project_id: form.project_id, shift_id: form.shift_id, status: form.status });
			setEditing(null);
			load();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to update staff member');
		}
	}

	async function removeFromGroup(s: StaffRow) {
		const confirmed = window.confirm(
			`Remove @${s.telegram_username ?? 'unknown'} from the Telegram group and PERMANENTLY delete their attendance, break, and fine history?\n\nThis cannot be undone.`
		);
		if (!confirmed) return;

		setGroupMessage((m) => ({ ...m, [s.id]: '' }));
		try {
			await api.staff.removeFromGroup(s.id);
			load();
		} catch (e) {
			setGroupMessage((m) => ({ ...m, [s.id]: e instanceof Error ? e.message : 'Failed to remove staff member' }));
		}
	}

	const filtered = staff.filter((s) => {
		if (statusFilter !== 'all' && s.status !== statusFilter) return false;
		if (search.trim()) {
			const q = search.trim().toLowerCase();
			const matches =
				(s.telegram_username ?? '').toLowerCase().includes(q) ||
				String(s.telegram_id).includes(q) ||
				(s.project_name ?? '').toLowerCase().includes(q);
			if (!matches) return false;
		}
		return true;
	});

	const dayStaff = filtered.filter((s) => s.shift_type === 'day');
	const nightStaff = filtered.filter((s) => s.shift_type === 'night');
	const unassignedStaff = filtered.filter((s) => s.shift_type !== 'day' && s.shift_type !== 'night');

	function renderTable(rows: StaffRow[]) {
		return (
			<table>
				<thead>
					<tr>
						<th>Employee</th>
						<th>Telegram ID</th>
						<th>Project</th>
						<th>Shift Time</th>
						<th>Status</th>
						<th>Current State</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{rows.map((s) => (
						<tr key={s.id}>
							<td>@{s.telegram_username ?? 'unknown'}</td>
							<td>{s.telegram_id}</td>
							<td>{s.project_name ?? '-'}</td>
							<td>{s.start_time ? `${s.start_time} - ${s.end_time}` : '-'}</td>
							<td>{s.status}</td>
							<td>{s.current_state}</td>
							<td>
								<button onClick={() => openEdit(s)}>Edit</button>
								<button onClick={() => removeFromGroup(s)} style={{ background: '#dc2626' }}>
									Remove &amp; Delete
								</button>
								{groupMessage[s.id] && <div style={{ fontSize: 12, marginTop: 4 }}>{groupMessage[s.id]}</div>}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		);
	}

	// Intentionally not filtered by the selected project — every schedule that exists should be
	// pickable here, since an edit can also move a staff member to a different project's schedule.

	return (
		<div>
			<h2>Staff Management</h2>

			<div className="toolbar">
				<input placeholder="Search by username, Telegram ID, or project..." value={search} onChange={(e) => setSearch(e.target.value)} />
				<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
					<option value="all">All Statuses</option>
					<option value="active">Active</option>
					<option value="disabled">Disabled</option>
					<option value="pending">Pending</option>
				</select>
			</div>

			<h3>Day Shift Staff</h3>
			{dayStaff.length > 0 ? renderTable(dayStaff) : <p>No day shift staff.</p>}

			<h3 style={{ marginTop: 32 }}>Night Shift Staff</h3>
			{nightStaff.length > 0 ? renderTable(nightStaff) : <p>No night shift staff.</p>}

			{unassignedStaff.length > 0 && (
				<>
					<h3 style={{ marginTop: 32 }}>Unassigned / Other</h3>
					{renderTable(unassignedStaff)}
				</>
			)}

			{editing && (
				<div className="modal-backdrop" onClick={() => setEditing(null)}>
					<div className="modal" onClick={(e) => e.stopPropagation()}>
						<h3>Edit @{editing.telegram_username ?? 'unknown'}</h3>

						<label>Project</label>
						<select
							value={form.project_id}
							onChange={(e) => setForm({ ...form, project_id: Number(e.target.value), shift_id: 0 })}
						>
							<option value={0} disabled>
								Select project
							</option>
							{projects.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>

						<label>Shift</label>
						<select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: Number(e.target.value) })}>
							<option value={0} disabled>
								Select shift
							</option>
							{shifts.map((sh) => (
								<option key={sh.id} value={sh.id}>
									{sh.project_name} — {sh.type === 'day' ? 'Day' : 'Night'} Shift ({sh.start_time}-{sh.end_time}, break{' '}
									{sh.break_limit_minutes}m)
								</option>
							))}
						</select>

						<label>Status</label>
						<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
							<option value="active">Active</option>
							<option value="disabled">Disabled</option>
						</select>

						{error && <p style={{ color: '#dc2626' }}>{error}</p>}

						<div className="modal-actions">
							<button onClick={() => setEditing(null)}>Cancel</button>
							<button onClick={saveEdit}>Save</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
