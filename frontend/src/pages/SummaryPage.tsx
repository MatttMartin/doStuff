// src/pages/SummaryPage.tsx
import { useEffect, useState } from "react";
import RunCarousel from "../components/RunCarousel";
import type { StepItem } from "../components/RunCarousel";

const API_BASE = import.meta.env.VITE_API_BASE as string;

export default function SummaryPage() {
	const [steps, setSteps] = useState<StepItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [runId, setRunId] = useState<string | null>(null);
	const [isPublic, setIsPublic] = useState<boolean>(true);

	// -----------------------------
	// Load steps + run visibility
	// -----------------------------
	useEffect(() => {
		async function load() {
			const stored = localStorage.getItem("last_run_id") ?? localStorage.getItem("current_run_id");

			if (!stored) {
				setLoading(false);
				return;
			}

			setRunId(stored);

			try {
				const res = await fetch(`${API_BASE}/runs/${stored}/steps`);
				const json = await res.json();
				setSteps(json.steps || []);

				const runRes = await fetch(`${API_BASE}/runs/${stored}`);
				const runJson = await runRes.json();
				setIsPublic(!!runJson.public);
			} catch (err) {
				console.error("Failed to load run summary", err);
			}
			setLoading(false);
		}

		load();
	}, []);

	// -----------------------------
	// Backend actions
	// -----------------------------
	async function updateVisibility(publicValue: boolean) {
		if (!runId) return;

		try {
			await fetch(`${API_BASE}/runs/${runId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ public: publicValue }),
			});
		} catch (err) {
			console.error("Failed to update public/private:", err);
		}
	}

	async function deleteRun() {
		if (!runId) return;

		try {
			await fetch(`${API_BASE}/runs/${runId}`, { method: "DELETE" });
		} catch (err) {
			console.error("Failed to delete run:", err);
		}

		localStorage.removeItem("last_run_id");
		localStorage.removeItem("current_run_id");

		window.location.href = "/feed";
	}

	// -----------------------------
	// UI handlers
	// -----------------------------
	function handleVisibilityChange(nextValue: boolean) {
		setIsPublic(nextValue);
		updateVisibility(nextValue);
	}

	async function handlePost() {
		if (!runId) return;

		await updateVisibility(isPublic);

		// optional: call finish endpoint again (does nothing if already finished)
		await fetch(`${API_BASE}/runs/${runId}/finish`, { method: "POST" });

		window.location.href = "/feed";
	}

	function handleDelete() {
		const ok = confirm("Delete this run permanently?");
		if (!ok) return;
		deleteRun();
	}

	// -----------------------------
	// Render
	// -----------------------------
	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center text-neutral-300 font-['VT323'] text-4xl">
				<p className="animate-[flicker_1.4s_steps(2)_infinite] tracking-widest">LOADING…</p>
			</div>
		);
	}

	if (!runId || steps.length === 0) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center text-neutral-500 font-['VT323'] text-2xl text-center gap-4 px-4">
				<p>No run summary to show.</p>
				<button
					className="mt-4 px-8 py-3 text-lg bg-neutral-900 border border-neutral-700 rounded-xl hover:border-white hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all font-['VT323'] text-neutral-100"
					onClick={() => (window.location.href = "/")}
				>
					BACK HOME
				</button>
			</div>
		);
	}

	return (
		<div className="min-h-screen w-full px-4 py-4 flex flex-col items-center text-neutral-100 font-['VT323']">
			<h1 className="text-3xl sm:text-4xl md:text-5xl mb-2 tracking-[0.3em] text-center drop-shadow-[0_0_12px_rgba(255,255,255,0.35)]">
				RUN SUMMARY
			</h1>

			<div className="w-full max-w-4xl flex flex-col items-center gap-0 md:gap-0">
				<RunCarousel steps={steps} showDelete onDelete={handleDelete} />

				<button
					type="button"
					onClick={handlePost}
					className="
            mt-2 px-20 py-3
            bg-neutral-900 border border-neutral-700 rounded-xl
            text-lg sm:text-xl tracking-widest
            font-['VT323'] text-neutral-100
            hover:border-cyan-400 hover:shadow-[0_0_18px_rgba(0,255,255,0.35)]
            transition-all duration-200
          "
				>
					POST
				</button>

				{/* Public/Private toggle */}
				<div className="mt-1 flex items-center justify-center gap-4 text-xs sm:text-sm font-mono">
					<button
						type="button"
						onClick={() => handleVisibilityChange(false)}
						className={
							"transition-all duration-200 " +
							(!isPublic
								? "text-cyan-300 drop-shadow-[0_0_10px_rgba(0,255,255,0.7)]"
								: "text-neutral-500 hover:text-neutral-300")
						}
					>
						private
					</button>

					<button
						type="button"
						onClick={() => handleVisibilityChange(!isPublic)}
						className="w-12 h-6 border border-neutral-700 rounded-md bg-black/80 flex items-center px-1"
						aria-label="Toggle public/private"
					>
						<div
							className={
								"w-4 h-4 rounded-sm bg-neutral-200 border border-neutral-700 transition-all duration-200 " +
								(isPublic ? "ml-auto" : "")
							}
						/>
					</button>

					<button
						type="button"
						onClick={() => handleVisibilityChange(true)}
						className={
							"transition-all duration-200 " +
							(isPublic
								? "text-cyan-300 drop-shadow-[0_0_10px_rgba(0,255,255,0.7)]"
								: "text-neutral-500 hover:text-neutral-300")
						}
					>
						public
					</button>
				</div>
			</div>
		</div>
	);
}
