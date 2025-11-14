export const API_BASE = import.meta.env.VITE_API_BASE as string;

export type RunSummary = {
	id: string;
	caption: string | null;
	public: boolean;
	created_at: string | null;
	steps_completed: number;
};

export type RunStepDetail = {
	id: number;
	level_id: number;
	level_title: string;
	proof_url: string | null;
	completed: boolean;
	created_at: string | null;
};

export type RunDetail = {
	id: string;
	caption: string | null;
	public: boolean;
	created_at: string | null;
	steps: RunStepDetail[];
};

export async function getLevels() {
	const res = await fetch(`${API_BASE}/levels`);
	if (!res.ok) throw new Error(`Failed to fetch levels: ${res.status}`);
	return (await res.json()) as Array<{
		id: number;
		title: string;
		description: string | null;
		category: string | null;
		difficulty: number | null;
		seconds_limit: number | null;
	}>;
}

export async function createRun(userId: string, caption?: string) {
	const res = await fetch(`${API_BASE}/runs`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ user_id: userId, caption, public: true }),
	});
	if (!res.ok) throw new Error(`Failed to create run: ${res.status}`);
	return (await res.json()) as { id: string };
}

export async function addStep(runId: string, levelId: number, proofUrl?: string) {
	const res = await fetch(`${API_BASE}/runs/${runId}/steps`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ level_id: levelId, completed: true, proof_url: proofUrl ?? null }),
	});
	if (!res.ok) throw new Error(`Failed to add step: ${res.status}`);
	return (await res.json()) as { id: number };
}

export async function uploadProof(file: File) {
	const form = new FormData();
	form.append("file", file);
	const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: form });
	if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
	return (await res.json()) as { path: string; url: string };
}

export async function getRunsForUser(userId: string): Promise<RunSummary[]> {
	const res = await fetch(`${API_BASE}/runs/by-user/${userId}`);
	if (!res.ok) {
		throw new Error(`Failed to fetch runs: ${res.status} ${res.statusText}`);
	}
	return res.json();
}

export async function getRunDetail(runId: string): Promise<RunDetail> {
	const res = await fetch(`${API_BASE}/runs/${runId}`);
	if (!res.ok) {
		throw new Error(`Failed to fetch run: ${res.status} ${res.statusText}`);
	}
	return res.json();
}
