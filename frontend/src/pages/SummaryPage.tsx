import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE as string;

interface StepItem {
	level_number: number | null;
	title: string | null;
	description: string | null;
	completed: boolean;
	skipped_whole: boolean;
	proof_url: string | null;
	completed_at: string | null;
}

export default function SummaryPage() {
	const [steps, setSteps] = useState<StepItem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function load() {
			const rid = localStorage.getItem("last_run_id");
			if (!rid) {
				setLoading(false);
				console.log(rid);
				return;
			}

			const res = await fetch(`${API_BASE}/runs/${rid}/steps`);
			const json = await res.json();
			setSteps(json.steps);
			setLoading(false);
		}

		load();
	}, []);

	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center text-neutral-300 font-['VT323'] text-4xl">
				LOADING…
			</div>
		);
	}

	return (
		<div className="min-h-screen w-full px-6 py-10 text-neutral-100 font-['VT323']">
			<h1 className="text-5xl mb-10 text-center tracking-widest drop-shadow-[0_0_8px_rgba(0,140,255,0.3)]">
				RUN SUMMARY
			</h1>

			<div className="space-y-12 max-w-xl mx-auto">
				{steps.map((s, i) => (
					<div key={i} className="bg-neutral-900/40 border border-neutral-700 rounded-xl p-6 shadow-lg">
						<p className="text-neutral-500 text-sm mb-2 tracking-wider">LEVEL {s.level_number}</p>

						<h2 className="text-3xl mb-2">{s.title}</h2>

						<p className="text-neutral-400 font-mono text-sm mb-4">{s.description}</p>

						{/* Proof image */}
						<div className="w-full rounded-lg overflow-hidden border border-neutral-700 bg-neutral-800">
							{s.proof_url ? (
								<img src={s.proof_url} className="w-full object-contain" />
							) : (
								<div className="py-12 text-neutral-600 font-mono text-sm">no proof</div>
							)}
						</div>

						<p className="mt-4 text-neutral-400 font-mono text-xs">
							{s.completed ? (s.skipped_whole ? "Skipped" : "Completed") : "Timed out / Failed"}
						</p>

						{s.completed_at && (
							<p className="text-neutral-500 font-mono text-xs mt-1">{s.completed_at.replace("T", " ").slice(0, 16)}</p>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
