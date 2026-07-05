import { useState } from 'react';
import { api } from '../lib/api';

function toCSV(rows: Record<string, unknown>[]): string {
	if (rows.length === 0) return '';
	const columns = Array.from(
		rows.reduce((set, r) => {
			Object.keys(r).forEach((k) => set.add(k));
			return set;
		}, new Set<string>())
	);
	const lines = [columns.join(',')];
	for (const row of rows) {
		lines.push(columns.map((c) => JSON.stringify(row[c] ?? '')).join(','));
	}
	return lines.join('\n');
}

function download(filename: string, content: string) {
	const blob = new Blob([content], { type: 'text/csv' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function ShiftReportSection({ shift, label }: { shift: 'day' | 'night'; label: string }) {
	const today = new Date().toISOString().slice(0, 10);
	const [from, setFrom] = useState(today);
	const [to, setTo] = useState(today);
	const [attendanceRows, setAttendanceRows] = useState<Record<string, unknown>[]>([]);
	const [breakRows, setBreakRows] = useState<Record<string, unknown>[]>([]);

	async function runAttendanceReport() {
		setAttendanceRows(await api.reports.attendance(from, to, shift));
	}

	async function runBreakReport() {
		setBreakRows(await api.reports.breaks(from, to, shift));
	}

	const attendanceColumns = attendanceRows[0] ? Object.keys(attendanceRows[0]) : [];
	const breakColumns = Array.from(
		breakRows.reduce((set, r) => {
			Object.keys(r).forEach((k) => set.add(k));
			return set;
		}, new Set<string>())
	);

	return (
		<div style={{ marginBottom: 48 }}>
			<h2>{label}</h2>
			<div className="toolbar">
				<label>From</label>
				<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
				<label>To</label>
				<input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
			</div>

			<section>
				<div className="toolbar">
					<h3>Attendance Report</h3>
					<button onClick={runAttendanceReport}>Generate</button>
					{attendanceRows.length > 0 && (
						<button onClick={() => download(`${shift}-attendance-report.csv`, toCSV(attendanceRows))}>Export CSV</button>
					)}
				</div>
				{attendanceRows.length > 0 ? (
					<table>
						<thead>
							<tr>
								{attendanceColumns.map((c) => (
									<th key={c}>{c}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{attendanceRows.map((r, i) => (
								<tr key={i}>
									{attendanceColumns.map((c) => (
										<td key={c}>{String(r[c] ?? '')}</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<p style={{ color: '#64748b' }}>No report generated yet.</p>
				)}
			</section>

			<section>
				<div className="toolbar">
					<h3>Break Time Report</h3>
					<button onClick={runBreakReport}>Generate</button>
					{breakRows.length > 0 && (
						<button onClick={() => download(`${shift}-break-report.csv`, toCSV(breakRows))}>Export CSV</button>
					)}
				</div>
				{breakRows.length > 0 ? (
					<table>
						<thead>
							<tr>
								{breakColumns.map((c) => (
									<th key={c}>{c}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{breakRows.map((r, i) => (
								<tr key={i}>
									{breakColumns.map((c) => (
										<td key={c}>{String(r[c] ?? '')}</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<p style={{ color: '#64748b' }}>No report generated yet.</p>
				)}
			</section>
		</div>
	);
}

export default function Reports() {
	return (
		<div>
			<h1 style={{ marginBottom: 24 }}>Reports</h1>
			<ShiftReportSection shift="day" label="Day Shift Reports" />
			<ShiftReportSection shift="night" label="Night Shift Reports" />
		</div>
	);
}
