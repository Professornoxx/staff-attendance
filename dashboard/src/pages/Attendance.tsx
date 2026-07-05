import { useEffect, useState } from 'react';
import { api, type AttendanceRow, type FineRow } from '../lib/api';

export default function Attendance() {
	const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
	const [shift, setShift] = useState<'all' | 'day' | 'night'>('all');
	const [rows, setRows] = useState<AttendanceRow[]>([]);
	const [fineTarget, setFineTarget] = useState<AttendanceRow | null>(null);
	const [existingFines, setExistingFines] = useState<FineRow[]>([]);
	const [fineAmount, setFineAmount] = useState('500');
	const [fineReason, setFineReason] = useState('');
	const [error, setError] = useState('');

	function load() {
		api.attendance.list(date, shift === 'all' ? undefined : shift).then(setRows);
	}

	useEffect(load, [date, shift]);

	async function openFineModal(row: AttendanceRow) {
		setFineTarget(row);
		setError('');
		const fines = await api.fines.list(row.id);
		setExistingFines(fines);
	}

	async function submitFine() {
		if (!fineTarget) return;
		setError('');
		try {
			await api.fines.add({
				staff_id: fineTarget.staff_id,
				attendance_id: fineTarget.id,
				amount: Number(fineAmount),
				reason: fineReason,
			});
			setFineReason('');
			const fines = await api.fines.list(fineTarget.id);
			setExistingFines(fines);
			load();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to add fine');
		}
	}

	async function removeFine(fineId: number) {
		if (!fineTarget) return;
		setError('');
		try {
			await api.fines.remove(fineId);
			const fines = await api.fines.list(fineTarget.id);
			setExistingFines(fines);
			load();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to remove fine');
		}
	}

	return (
		<div>
			<div className="toolbar">
				<h2>Attendance</h2>
				<input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
				<select value={shift} onChange={(e) => setShift(e.target.value as typeof shift)}>
					<option value="all">All Shifts</option>
					<option value="day">Day Shift</option>
					<option value="night">Night Shift</option>
				</select>
			</div>

			<table>
				<thead>
					<tr>
						<th>Employee</th>
						<th>Shift</th>
						<th>Project</th>
						<th>Login</th>
						<th>Logout</th>
						<th>Working Mins</th>
						<th>Break Mins</th>
						<th>Status</th>
						<th>Current State</th>
						<th>Fine</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr key={r.id}>
							<td>@{r.telegram_username}</td>
							<td>{r.shift_type}</td>
							<td>{r.project_name}</td>
							<td>{r.login_time ? new Date(r.login_time).toLocaleTimeString() : '-'}</td>
							<td>{r.logout_time ? new Date(r.logout_time).toLocaleTimeString() : '-'}</td>
							<td>{r.total_working_minutes ?? '-'}</td>
							<td>{r.total_break_minutes}</td>
							<td>{r.day_status ?? '-'}</td>
							<td>{r.current_state}</td>
							<td>{r.total_fine > 0 ? `Rs.${r.total_fine}` : '-'}</td>
							<td>
								<button onClick={() => openFineModal(r)}>Manage Fines</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>

			{fineTarget && (
				<div className="modal-backdrop" onClick={() => setFineTarget(null)}>
					<div className="modal" onClick={(e) => e.stopPropagation()}>
						<h3>Fines — @{fineTarget.telegram_username}</h3>

						{existingFines.length === 0 ? (
							<p style={{ color: '#64748b' }}>No fines recorded for this day.</p>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								{existingFines.map((f) => (
									<div
										key={f.id}
										style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
									>
										<div>
											<strong>Rs.{f.amount}</strong> ({f.type}){f.reason ? ` — ${f.reason}` : ''}
										</div>
										<button onClick={() => removeFine(f.id)} style={{ background: '#dc2626' }}>
											Remove
										</button>
									</div>
								))}
							</div>
						)}

						<hr style={{ width: '100%', margin: '12px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

						<label>Add Fine — Amount</label>
						<input value={fineAmount} onChange={(e) => setFineAmount(e.target.value)} type="number" />
						<label>Reason (optional)</label>
						<input value={fineReason} onChange={(e) => setFineReason(e.target.value)} />

						{error && <p style={{ color: '#dc2626' }}>{error}</p>}

						<div className="modal-actions">
							<button onClick={() => setFineTarget(null)}>Close</button>
							<button onClick={submitFine}>Add Fine</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
