import { useEffect, useState } from 'react';
import { api, type ProjectRow } from '../lib/api';

export default function Projects() {
	const [projects, setProjects] = useState<ProjectRow[]>([]);
	const [name, setName] = useState('');
	const [editingId, setEditingId] = useState<number | null>(null);

	function load() {
		api.projects.list().then(setProjects);
	}
	useEffect(load, []);

	async function save() {
		if (!name.trim()) return;
		if (editingId) {
			await api.projects.update(editingId, name);
		} else {
			await api.projects.create(name);
		}
		setName('');
		setEditingId(null);
		load();
	}

	async function remove(id: number) {
		await api.projects.remove(id);
		load();
	}

	return (
		<div>
			<h2>Projects</h2>
			<div className="form-row">
				<input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
				<button onClick={save}>{editingId ? 'Update' : 'Add'} Project</button>
				{editingId && (
					<button
						onClick={() => {
							setEditingId(null);
							setName('');
						}}
					>
						Cancel
					</button>
				)}
			</div>

			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{projects.map((p) => (
						<tr key={p.id}>
							<td>{p.name}</td>
							<td>
								<button
									onClick={() => {
										setEditingId(p.id);
										setName(p.name);
									}}
								>
									Edit
								</button>
								<button onClick={() => remove(p.id)}>Delete</button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
