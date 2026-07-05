import { useEffect, useState } from 'react';
import {
	CartesianGrid,
	Cell,
	Legend,
	Line,
	LineChart,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
	Bar,
	BarChart,
} from 'recharts';
import { api, type ChartsResponse, type ProjectRow } from '../lib/api';

interface OverviewData {
	total_staff: number;
	active_now: number;
	today_attendance_count: number;
	today_fine_count: number;
	today_fine_amount: number;
}

const COLORS = {
	present: '#16a34a',
	late: '#f59e0b',
	absent: '#dc2626',
	day: '#1d4ed8',
	night: '#4338ca',
	issued: '#1d4ed8',
	removed: '#94a3b8',
	bars: ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1e40af', '#1e3a8a', '#6366f1', '#8b5cf6'],
};

function todayISO() {
	return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d.toISOString().slice(0, 10);
}

export default function Overview() {
	const [date, setDate] = useState(todayISO());
	const [data, setData] = useState<OverviewData | null>(null);

	const [from, setFrom] = useState(daysAgoISO(29));
	const [to, setTo] = useState(todayISO());
	const [projects, setProjects] = useState<ProjectRow[]>([]);
	const [projectId, setProjectId] = useState<number | undefined>(undefined);
	const [shift, setShift] = useState<string | undefined>(undefined);
	const [charts, setCharts] = useState<ChartsResponse | null>(null);

	useEffect(() => {
		api.overview(date).then((d) => setData(d as OverviewData));
	}, [date]);

	useEffect(() => {
		api.projects.list().then(setProjects);
	}, []);

	useEffect(() => {
		api.charts({ from, to, project_id: projectId, shift }).then(setCharts);
	}, [from, to, projectId, shift]);

	const dayNightData =
		charts?.shift_distribution.map((s) => ({ name: s.shift_type === 'day' ? 'Day Shift' : 'Night Shift', value: s.count })) ?? [];
	const totalShiftStaff = dayNightData.reduce((sum, d) => sum + d.value, 0);

	return (
		<div>
			<div className="toolbar">
				<h2>Overview</h2>
				<input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
			</div>
			{data && (
				<div className="stat-grid">
					<div className="stat-card">
						<span className="stat-label">Total Staff</span>
						<span className="stat-value">{data.total_staff}</span>
					</div>
					<div className="stat-card">
						<span className="stat-label">Active Now</span>
						<span className="stat-value">{data.active_now}</span>
					</div>
					<div className="stat-card">
						<span className="stat-label">Today's Attendance</span>
						<span className="stat-value">{data.today_attendance_count}</span>
					</div>
					<div className="stat-card">
						<span className="stat-label">Today's Fines</span>
						<span className="stat-value">{data.today_fine_count}</span>
					</div>
					<div className="stat-card">
						<span className="stat-label">Total Fine Amount</span>
						<span className="stat-value">Rs. {data.today_fine_amount}</span>
					</div>
				</div>
			)}

			<h2 style={{ marginTop: 40 }}>Analytics</h2>
			<div className="toolbar">
				<label>From</label>
				<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
				<label>To</label>
				<input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
				<select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : undefined)}>
					<option value="">All Projects</option>
					{projects.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
				<select value={shift ?? ''} onChange={(e) => setShift(e.target.value || undefined)}>
					<option value="">All Shifts</option>
					<option value="day">Day Shift</option>
					<option value="night">Night Shift</option>
				</select>
			</div>

			<div className="chart-grid">
				<div className="chart-card">
					<h3>Attendance Trend</h3>
					<ResponsiveContainer width="100%" height={280}>
						<LineChart data={charts?.attendance_trend ?? []}>
							<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
							<XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={20} />
							<YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
							<Tooltip />
							<Legend />
							<Line type="monotone" dataKey="present" name="Present" stroke={COLORS.present} strokeWidth={2} dot={false} />
							<Line type="monotone" dataKey="late" name="Late" stroke={COLORS.late} strokeWidth={2} dot={false} />
							<Line type="monotone" dataKey="absent" name="Absent" stroke={COLORS.absent} strokeWidth={2} dot={false} />
						</LineChart>
					</ResponsiveContainer>
				</div>

				<div className="chart-card">
					<h3>Staff Distribution by Project</h3>
					<ResponsiveContainer width="100%" height={280}>
						<BarChart data={charts?.staff_by_project ?? []}>
							<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
							<XAxis dataKey="project_name" tick={{ fontSize: 11 }} />
							<YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
							<Tooltip />
							<Bar dataKey="count" name="Staff Count" radius={[4, 4, 0, 0]}>
								{(charts?.staff_by_project ?? []).map((_, i) => (
									<Cell key={i} fill={COLORS.bars[i % COLORS.bars.length]} />
								))}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>

				<div className="chart-card">
					<h3>Day Shift vs Night Shift</h3>
					<ResponsiveContainer width="100%" height={280}>
						<PieChart>
							<Pie
								data={dayNightData}
								dataKey="value"
								nameKey="name"
								innerRadius={60}
								outerRadius={95}
								paddingAngle={2}
								label={({ name, value }) =>
									totalShiftStaff > 0 ? `${name}: ${Math.round((value / totalShiftStaff) * 100)}%` : name
								}
							>
								{dayNightData.map((entry, i) => (
									<Cell key={i} fill={entry.name === 'Day Shift' ? COLORS.day : COLORS.night} />
								))}
							</Pie>
							<Tooltip />
							<Legend />
						</PieChart>
					</ResponsiveContainer>
				</div>

				<div className="chart-card">
					<h3>Fine Summary by Project</h3>
					<ResponsiveContainer width="100%" height={280}>
						<BarChart data={charts?.fine_summary ?? []}>
							<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
							<XAxis dataKey="project_name" tick={{ fontSize: 11 }} />
							<YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
							<Tooltip />
							<Legend />
							<Bar dataKey="issued_amount" name="Amount Issued (Rs.)" fill={COLORS.issued} radius={[4, 4, 0, 0]} />
							<Bar dataKey="removed_amount" name="Amount Removed (Rs.)" fill={COLORS.removed} radius={[4, 4, 0, 0]} />
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
}
