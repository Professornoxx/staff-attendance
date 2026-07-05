import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Overview from './pages/Overview';
import NewUsers from './pages/NewUsers';
import StaffManagement from './pages/StaffManagement';
import Attendance from './pages/Attendance';
import Shifts from './pages/Shifts';
import Projects from './pages/Projects';
import Reports from './pages/Reports';
import './App.css';

export default function App() {
	return (
		<BrowserRouter>
			<div className="app-shell">
				<nav>
					<h1>Attendance System</h1>
					<NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
						Overview
					</NavLink>
					<NavLink to="/new-users" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
						New Users
					</NavLink>
					<NavLink to="/staff" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
						Staff Management
					</NavLink>
					<NavLink to="/attendance" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
						Attendance
					</NavLink>
					<NavLink to="/shifts" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
						Shifts
					</NavLink>
					<NavLink to="/projects" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
						Projects
					</NavLink>
					<NavLink to="/reports" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
						Reports
					</NavLink>
				</nav>
				<main>
					<Routes>
						<Route path="/" element={<Overview />} />
						<Route path="/new-users" element={<NewUsers />} />
						<Route path="/staff" element={<StaffManagement />} />
						<Route path="/attendance" element={<Attendance />} />
						<Route path="/shifts" element={<Shifts />} />
						<Route path="/projects" element={<Projects />} />
						<Route path="/reports" element={<Reports />} />
					</Routes>
				</main>
			</div>
		</BrowserRouter>
	);
}
