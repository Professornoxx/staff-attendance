import { useEffect, useState } from 'react';
import { api, type ProjectRow, type ShiftRow, type StaffRow } from '../lib/api';

const emptyForm = { project_id: 0, type: 'day' as 'day' | 'night', start_time: '09:00', end_time: '18:00', break_limit_minutes: 65 };

// Numbered projects ("Project 1", "Project 2", ...) sort numerically first;
// everything else (e.g. "Project CoinUS") sorts alphabetically after them.
function projectSortKey(name: string): [number, number, string] {
	const match = name.match(/^Project (\d+)$/i);
	if (match) return [0, parseInt(match[1], 10), name];
	return [1, 0, name];
}
function compareProjects(a: ProjectRow, b: ProjectRow) {
	const ka = projectSortKey(a.name);
	const kb = projectSortKey(b.name);
	if (ka[0] !== kb[0]) return ka[0] - kb[0];
	if (ka[0] === 0) return ka[1] - kb[1];
	return ka[2].localeCompare(kb[2]);
}

export default function Shifts() {
	const [shifts, setShifts] = useState<ShiftRow[]>([]);
	const [projects, setProjects] = useState<ProjectRow[]>([]);
	const [staff, setStaff] = useState<StaffRow[]>([]);
	const [form, setForm] = useState(emptyForm);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [error, setError] = useState('');
	const [pendingAssignment, setPendingAssignment] = useState<Record<number, number>>({});
	const [assignError, setAssignError] = useState<Record<number, string>>({});
	const [activeTab, setActiveTab] = useState<'day' | 'night'>('day');

	function load() {
		api.shifts.list().then(setShifts);
		api.projects.list().then((p) => {
			setProjects(p);
			if (p.length > 0) setForm((f) => (f.project_id ? f : { ...f, project_id: p[0].id }));
		});
		api.staff.list({ status: 'active' }).then(setStaff);
	}
	useEffect(load, []);

	// Keep the schedule list fresh whenever this tab regains focus.
	useEffect(() => {
		function onFocus() {
			api.shifts.list().then(setShifts);
		}
		window.addEventListener('focus', onFocus);
		return () => window.removeEventListener('focus', onFocus);
	}, []);

	async function assign(staffMember: StaffRow) {
		const targetShiftId = pendingAssignment[staffMember.id];
		setAssignError((e) => ({ ...e, [staffMember.id]: '' }));
		if (!targetShiftId) {
			setAssignError((e) => ({ ...e, [staffMember.id]: 'Pick a schedule first.' }));
			return;
		}
		await api.staff.update(staffMember.id, { shift_id: targetShiftId });
		load();
	}

	async function save() {
		setError('');
		if (!form.project_id) {
			setError('Select a project first.');
			return;
		}
		try {
			if (editingId) {
				await api.shifts.update(editingId, form);
			} else {
				await api.shifts.create(form);
			}
			setForm({ ...emptyForm, project_id: form.project_id });
			setEditingId(null);
			load();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to save shift');
		}
	}

	function edit(s: ShiftRow) {
		setEditingId(s.id);
		setForm({
			project_id: s.project_id,
			type: s.type,
			start_time: s.start_time,
			end_time: s.end_time,
			break_limit_minutes: s.break_limit_minutes,
		});
	}

	async function remove(id: number) {
		await api.shifts.remove(id);
		load();
	}

	function renderStaffTable(rows: StaffRow[]) {
		return (
			<table>
				<thead>
					<tr>
						<th>Employee</th>
						<th>Project</th>
						<th>Current Schedule</th>
						<th>Reassign To</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{rows.map((s) => (
						<tr key={s.id}>
							<td>@{s.telegram_username}</td>
							<td>{s.project_name ?? '-'}</td>
							<td>{s.shift_type ? `${s.shift_type === 'day' ? 'Day' : 'Night'} ${s.start_time}-${s.end_time}` : 'Unassigned'}</td>
							<td>
								<select
									value={pendingAssignment[s.id] ?? 0}
									onChange={(e) => setPendingAssignment((p) => ({ ...p, [s.id]: Number(e.target.value) }))}
								>
									<option value={0} disabled>
										Select schedule
									</option>
									{shifts.map((sh) => (
										<option key={sh.id} value={sh.id}>
											{sh.project_name} — {sh.type === 'day' ? 'Day' : 'Night'} {sh.start_time}-{sh.end_time} (break{' '}
											{sh.break_limit_minutes}m)
										</option>
									))}
								</select>
							</td>
							<td>
								<button onClick={() => assign(s)}>Assign</button>
								{assignError[s.id] && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{assignError[s.id]}</div>}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		);
	}

	const sortedProjects = [...projects].sort(compareProjects);
	const staffForTab = staff.filter((s) => s.shift_type === activeTab);
	const unassignedStaff = staff.filter((s) => s.shift_type !== 'day' && s.shift_type !== 'night');

	return (
		<div>
			<h2>Shift Management</h2>
			<p style={{ color: '#64748b', marginBottom: 16 }}>
				A project can have multiple schedules per shift type — e.g. Day Shift 8-5, 9-6, and 10-7 — each with its own break
				limit.
			</p>

			<div className="form-row">
				<select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: Number(e.target.value) })}>
					<option value={0} disabled>
						Select project
					</option>
					{projects.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
				<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'day' | 'night' })}>
					<option value="day">Day</option>
					<option value="night">Night</option>
				</select>
				<input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
				<input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
				<input
					type="number"
					value={form.break_limit_minutes}
					onChange={(e) => setForm({ ...form, break_limit_minutes: Number(e.target.value) })}
					placeholder="Break limit (min)"
				/>
				<button onClick={save}>{editingId ? 'Update' : 'Add'} Schedule</button>
				{editingId && (
					<button
						onClick={() => {
							setEditingId(null);
							setForm(emptyForm);
						}}
					>
						Cancel
					</button>
				)}
			</div>
			{error && <p style={{ color: '#dc2626', marginBottom: 12 }}>{error}</p>}

			<div className="form-row">
				<button
					onClick={() => setActiveTab('day')}
					style={activeTab === 'day' ? undefined : { background: '#cbd5e1', color: '#1e293b' }}
				>
					Day Shift
				</button>
				<button
					onClick={() => setActiveTab('night')}
					style={activeTab === 'night' ? undefined : { background: '#cbd5e1', color: '#1e293b' }}
				>
					Night Shift
				</button>
			</div>

			<h2 style={{ marginTop: 8 }}>{activeTab === 'day' ? 'Day Shift' : 'Night Shift'} Schedules by Project</h2>
			{sortedProjects.map((p) => {
				const schedules = shifts.filter((sh) => sh.project_id === p.id && sh.type === activeTab);
				return (
					<div key={p.id} style={{ marginBottom: 20 }}>
						<h3>{p.name}</h3>
						{schedules.length === 0 ? (
							<p style={{ color: '#64748b', marginLeft: 12 }}>
								No {activeTab === 'day' ? 'Day' : 'Night'} Shift schedules configured yet.
							</p>
						) : (
							<table>
								<thead>
									<tr>
										<th>Start</th>
										<th>End</th>
										<th>Break Limit (min)</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{schedules.map((s) => (
										<tr key={s.id}>
											<td>{s.start_time}</td>
											<td>{s.end_time}</td>
											<td>{s.break_limit_minutes}</td>
											<td>
												<button onClick={() => edit(s)}>Edit</button>
												<button onClick={() => remove(s.id)}>Delete</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				);
			})}

			<h2 style={{ marginTop: 40 }}>{activeTab === 'day' ? 'Day Shift' : 'Night Shift'} Staff</h2>
			{staffForTab.length > 0 ? renderStaffTable(staffForTab) : <p style={{ color: '#64748b' }}>No staff on this shift.</p>}

			{unassignedStaff.length > 0 && (
				<>
					<h2 style={{ marginTop: 32 }}>Unassigned Staff</h2>
					{renderStaffTable(unassignedStaff)}
				</>
			)}
		</div>
	);
}
