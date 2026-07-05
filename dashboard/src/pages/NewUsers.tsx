import { useEffect, useState } from 'react';
import { api, type ProjectRow, type ShiftRow, type StaffRow } from '../lib/api';

type Mode = 'existing' | 'new';

interface ApprovalForm {
	mode: Mode;
	// existing mode
	shift_id: number;
	// new mode
	project_id: number;
	type: 'day' | 'night';
	start_time: string;
	end_time: string;
	break_limit_minutes: number;
}

const defaultForm: ApprovalForm = {
	mode: 'existing',
	shift_id: 0,
	project_id: 0,
	type: 'day',
	start_time: '09:00',
	end_time: '18:00',
	break_limit_minutes: 65,
};

export default function NewUsers() {
	const [pending, setPending] = useState<StaffRow[]>([]);
	const [projects, setProjects] = useState<ProjectRow[]>([]);
	const [shifts, setShifts] = useState<ShiftRow[]>([]);
	const [forms, setForms] = useState<Record<number, ApprovalForm>>({});
	const [error, setError] = useState<Record<number, string>>({});

	function load() {
		api.staff.list({ status: 'pending' }).then(setPending);
		api.projects.list().then(setProjects);
		api.shifts.list().then(setShifts);
	}
	useEffect(load, []);

	// Keep the schedule list fresh whenever this tab regains focus, so anything added on the
	// Shift Management page (here or in another tab) shows up without a manual reload.
	useEffect(() => {
		function onFocus() {
			api.shifts.list().then(setShifts);
		}
		window.addEventListener('focus', onFocus);
		return () => window.removeEventListener('focus', onFocus);
	}, []);

	function getForm(staffId: number): ApprovalForm {
		return forms[staffId] ?? { ...defaultForm, project_id: projects[0]?.id ?? 0 };
	}

	function updateForm(staffId: number, patch: Partial<ApprovalForm>) {
		setForms((f) => ({ ...f, [staffId]: { ...getForm(staffId), ...patch } }));
	}

	async function refreshShifts() {
		const fresh = await api.shifts.list();
		setShifts(fresh);
		return fresh;
	}

	async function approve(staffId: number) {
		const form = getForm(staffId);
		setError((e) => ({ ...e, [staffId]: '' }));

		try {
			if (form.mode === 'existing') {
				if (!form.shift_id) {
					setError((e) => ({ ...e, [staffId]: 'Select a schedule first.' }));
					return;
				}
				const shift = shifts.find((s) => s.id === form.shift_id);
				if (!shift) {
					setError((e) => ({ ...e, [staffId]: 'That schedule no longer exists — refresh and try again.' }));
					return;
				}
				await api.staff.approve(staffId, { project_id: shift.project_id, shift_id: shift.id });
			} else {
				if (!form.project_id) {
					setError((e) => ({ ...e, [staffId]: 'Select a project first.' }));
					return;
				}
				await api.staff.approve(staffId, {
					project_id: form.project_id,
					type: form.type,
					start_time: form.start_time,
					end_time: form.end_time,
					break_limit_minutes: form.break_limit_minutes,
				});
			}
			setForms((f) => {
				const next = { ...f };
				delete next[staffId];
				return next;
			});
			load();
		} catch (e) {
			setError((err) => ({ ...err, [staffId]: e instanceof Error ? e.message : 'Failed to approve' }));
		}
	}

	return (
		<div>
			<h2>New User Management</h2>
			<p style={{ color: '#64748b', marginBottom: 16 }}>
				Newly registered staff appear here until approved. Pick an existing shift schedule, or create a new one, then
				approve to activate their account.
			</p>

			{pending.length === 0 && <p>No pending registrations.</p>}

			{pending.map((staff) => {
				const form = getForm(staff.id);

				return (
					<div key={staff.id} className="new-user-card">
						<div className="new-user-header">
							<strong>@{staff.telegram_username ?? 'unknown'}</strong>
							<span style={{ color: '#64748b' }}>Telegram ID: {staff.telegram_id}</span>
							<span style={{ color: '#64748b' }}>Registered: {new Date(staff.created_at).toLocaleString()}</span>
						</div>

						<div className="form-row" style={{ gap: 20 }}>
							<label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
								<input
									type="radio"
									checked={form.mode === 'existing'}
									onChange={async () => {
										await refreshShifts();
										updateForm(staff.id, { mode: 'existing' });
									}}
								/>
								Select Existing Schedule
							</label>
							<label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
								<input type="radio" checked={form.mode === 'new'} onChange={() => updateForm(staff.id, { mode: 'new' })} />
								Create New Schedule
							</label>
						</div>

						{form.mode === 'existing' ? (
							<div className="form-row">
								{shifts.length === 0 ? (
									<p style={{ color: '#64748b' }}>
										No schedules exist yet — switch to "Create New Schedule" to add the first one.
									</p>
								) : (
									<select value={form.shift_id} onChange={(e) => updateForm(staff.id, { shift_id: Number(e.target.value) })}>
										<option value={0} disabled>
											Select a schedule
										</option>
										{shifts.map((s) => (
											<option key={s.id} value={s.id}>
												{s.project_name} — {s.type === 'day' ? 'Day' : 'Night'} Shift ({s.start_time}-{s.end_time}, break{' '}
												{s.break_limit_minutes}m)
											</option>
										))}
									</select>
								)}
							</div>
						) : (
							<div className="form-row">
								<select value={form.project_id} onChange={(e) => updateForm(staff.id, { project_id: Number(e.target.value) })}>
									<option value={0} disabled>
										Select project
									</option>
									{projects.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name}
										</option>
									))}
								</select>
								<select value={form.type} onChange={(e) => updateForm(staff.id, { type: e.target.value as 'day' | 'night' })}>
									<option value="day">Day Shift</option>
									<option value="night">Night Shift</option>
								</select>
								<input type="time" value={form.start_time} onChange={(e) => updateForm(staff.id, { start_time: e.target.value })} />
								<input type="time" value={form.end_time} onChange={(e) => updateForm(staff.id, { end_time: e.target.value })} />
								<input
									type="number"
									value={form.break_limit_minutes}
									onChange={(e) => updateForm(staff.id, { break_limit_minutes: Number(e.target.value) })}
									placeholder="Break limit (min)"
								/>
							</div>
						)}

						<button onClick={() => approve(staff.id)}>Approve</button>
						{error[staff.id] && <p style={{ color: '#dc2626' }}>{error[staff.id]}</p>}
					</div>
				);
			})}
		</div>
	);
}
