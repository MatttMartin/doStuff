import LoadingOverlay from "../loadingOverlay";

import React, { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE as string;

// --------------------------------------------
// Types (matching backend)
// --------------------------------------------
interface Level {
	id: number;
	title: string;
	description: string | null;
	level_number: number;
	seconds_limit: number | null;
}

interface RunState {
	id: string;
	user_id: string;
	caption: string | null;
	started_at: string | null;
	finished_at: string | null;

	pending_level_id: number | null;
	pending_started_at: string | null;
	pending_time_limit: number | null;

	proof_pending: boolean | null;
	skips_used: number;

	// backend also returns pending_level; we don't strictly need to type it
	pending_level?: Level | null;
}

// --------------------------------------------
// Styles
// --------------------------------------------
const buttonPrimary =
	"w-full py-4 rounded-xl font-['VT323'] text-3xl tracking-wide " +
	"bg-neutral-900/60 backdrop-blur-sm border border-neutral-700/80 " +
	"hover:border-blue-400 hover:bg-neutral-900/80 transition-all duration-200 " +
	"shadow-[inset_0_0_8px_rgba(255,255,255,0.08),0_0_6px_rgba(0,0,0,0.4)] " +
	"hover:shadow-[inset_0_0_12px_rgba(255,255,255,0.12),0_0_12px_rgba(0,140,255,0.35)]";

const MAX_SKIPS = 1;

// --------------------------------------------
// Component
// --------------------------------------------
export default function ChallengePage() {
	const [levels, setLevels] = useState<Level[]>([]);
	const [runId, setRunId] = useState<string | null>(null);
	const [challenge, setChallenge] = useState<Level | null>(null);
	const [timeLeft, setTimeLeft] = useState(0);
	const [skipsUsed, setSkipsUsed] = useState(0);
	const [showUploadStep, setShowUploadStep] = useState(false);

	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const [previewType, setPreviewType] = useState<string | null>(null);

	// --------------------------------------------
	// Helpers
	// --------------------------------------------
	function formatTime(sec: number) {
		const m = Math.floor(sec / 60)
			.toString()
			.padStart(2, "0");
		const s = (sec % 60).toString().padStart(2, "0");
		return `${m}:${s}`;
	}

	function computeRemaining(startISO: string | null, limitSec: number | null) {
		if (!startISO || !limitSec) return 0;
		const start = new Date(startISO).getTime();
		const elapsed = Math.floor((Date.now() - start) / 1000);
		return limitSec - elapsed;
	}

	function clearProofPreview() {
		if (preview) {
			URL.revokeObjectURL(preview);
		}
		setPreview(null);
		setFile(null);
	}

	// --------------------------------------------
	// INIT: create/restore run and infer time left
	// --------------------------------------------
	useEffect(() => {
		async function init() {
			setLoading(true);

			let uid = localStorage.getItem("user_id");
			if (!uid) {
				uid = crypto.randomUUID();
				localStorage.setItem("user_id", uid);
			}

			// 1. Load all levels
			const levelRes = await fetch(`${API_BASE}/levels`);
			const levelJson: Level[] = await levelRes.json();
			setLevels(levelJson);

			// 2. Ensure we have a run id
			let storedRun = localStorage.getItem("current_run_id") ?? "";

			if (!storedRun) {
				const rr = await fetch(`${API_BASE}/runs`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ user_id: uid, caption: null, public: false }),
				});
				const newRun = await rr.json();
				storedRun = newRun.id;
				localStorage.setItem("current_run_id", storedRun);
			}

			setRunId(storedRun);

			// 3. Load current run state
			const runRes = await fetch(`${API_BASE}/runs/${storedRun}`);
			const run: RunState = await runRes.json();

			// If run finished, just show finished screen
			if (run.finished_at) {
				setChallenge(null);
				setSkipsUsed(run.skips_used ?? 0);
				setShowUploadStep(false);
				setTimeLeft(0);
				setLoading(false);
				return;
			}

			setSkipsUsed(run.skips_used ?? 0);

			// Determine current challenge
			let pending: Level | null = null;

			// Prefer backend's embedded pending_level if present
			if (run.pending_level_id && (run as any).pending_level) {
				pending = (run as any).pending_level as Level;
			} else if (run.pending_level_id) {
				pending = levelJson.find((l) => l.id === run.pending_level_id) ?? null;
			}

			setChallenge(pending);

			if (!pending) {
				// No pending level but also not finished -> treat as finished-ish
				setChallenge(null);
				setShowUploadStep(false);
				setTimeLeft(0);
				setLoading(false);
				return;
			}

			// If we're on proof step, no timer
			if (run.proof_pending) {
				setShowUploadStep(true);
				setTimeLeft(0);
				setLoading(false);
				return;
			}

			// Otherwise we are on main timer step:
			const remaining = computeRemaining(run.pending_started_at, run.pending_time_limit);

			if (remaining <= 0) {
				// Time ran out while away: treat as timeout now
				await handleTimeout(storedRun, pending, run.skips_used ?? 0);
				setLoading(false);
				return;
			}

			setShowUploadStep(false);
			setTimeLeft(remaining);
			setLoading(false);
		}

		init();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// --------------------------------------------
	// TIMER
	// --------------------------------------------
	useEffect(() => {
		// Don't tick while loading or on proof step
		if (loading) return;
		if (!challenge || showUploadStep) return;

		if (timeLeft <= 0 && runId && challenge) {
			// Time's up while on this tab
			handleTimeout(runId, challenge, skipsUsed);
			return;
		}

		const t = setInterval(() => setTimeLeft((t) => t - 1), 1000);
		return () => clearInterval(t);
	}, [timeLeft, challenge, showUploadStep, runId, skipsUsed, loading]);

	// --------------------------------------------
	// TIMEOUT LOGIC
	// --------------------------------------------
	async function handleTimeout(rid: string, _lvl: Level, currentSkipsUsed: number) {
		setLoading(true);

		// No skips left → run ends
		if (currentSkipsUsed >= MAX_SKIPS) {
			await fetch(`${API_BASE}/runs/${rid}/finish`, { method: "POST" });
			clearProofPreview();
			setChallenge(null);

			finalizeRun();
			setLoading(false);
			return;
		}

		// Use skip on timeout (backend will treat as skipped_whole)
		await fetch(`${API_BASE}/runs/${rid}/submit-step`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				completed: false,
				skipped_whole: true,
				proof_url: null,
			}),
		});

		// Then reload run state from backend
		await loadNextRunState(rid);
	}

	// --------------------------------------------
	// Load next state from backend
	// --------------------------------------------
	async function loadNextRunState(rid: string) {
		setLoading(true);

		const rr = await fetch(`${API_BASE}/runs/${rid}`);
		const run: RunState = await rr.json();

		setSkipsUsed(run.skips_used ?? 0);

		if (run.finished_at) {
			clearProofPreview();
			setChallenge(null);
			finalizeRun();
			setLoading(false);
			return;
		}

		let pending: Level | null = null;

		if (run.pending_level_id && (run as any).pending_level) {
			pending = (run as any).pending_level as Level;
		} else if (run.pending_level_id) {
			pending = levels.find((l) => l.id === run.pending_level_id) ?? null;
		}

		setChallenge(pending);

		// Always reset proof UI when we move to the next challenge
		clearProofPreview();

		if (!pending) {
			setLoading(false);
			return;
		}

		if (run.proof_pending) {
			setShowUploadStep(true);
			setTimeLeft(0);
		} else {
			setShowUploadStep(false);
			const remain = computeRemaining(run.pending_started_at, run.pending_time_limit);
			setTimeLeft(remain > 0 ? remain : 1);
		}

		setLoading(false);
	}

	// --------------------------------------------
	// File handling
	// --------------------------------------------
	const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setFile(file);
		setPreview(URL.createObjectURL(file));
		setPreviewType(file.type); // <-- NEW
	};

	async function uploadProof() {
		if (!file) return null;

		const fd = new FormData();
		fd.append("file", file);

		try {
			const res = await fetch(`${API_BASE}/upload`, {
				method: "POST",
				body: fd,
			});

			if (!res.ok) {
				throw new Error(`Upload failed (${res.status})`);
			}

			const json = await res.json();
			return json.url as string;
		} catch (err) {
			console.error(err);
			throw err; // ❗ throw so the caller knows it failed
		}
	}

	// --------------------------------------------
	// Actions
	// --------------------------------------------
	async function handleGiveUp() {
		if (!runId) return;
		setLoading(true);
		await fetch(`${API_BASE}/runs/${runId}/finish`, { method: "POST" });
		clearProofPreview();
		finalizeRun();
		setChallenge(null);
		setLoading(false);
	}

	function handleDone() {
		// DONE = move to proof step, no submit yet
		if (!runId || !challenge) return;
		setShowUploadStep(true);
		setTimeLeft(0);

		// Persist proof_pending = true on backend
		fetch(`${API_BASE}/runs/${runId}/set-proof-state`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ proof_pending: true }),
		}).catch(() => {
			// non-fatal if this fails; frontend still on proof step
		});
	}

	async function handleSkipChallenge() {
		if (!runId || !challenge) return;

		if (skipsUsed >= MAX_SKIPS) {
			return;
		}

		setLoading(true);

		// Tell backend we skipped the whole challenge
		await fetch(`${API_BASE}/runs/${runId}/submit-step`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				completed: false,
				skipped_whole: true,
				proof_url: null,
			}),
		});

		await loadNextRunState(runId);
	}

	async function handleSkipProof() {
		if (!runId || !challenge) return;

		setLoading(true);

		// Completed=true but proof_url=null
		await fetch(`${API_BASE}/runs/${runId}/submit-step`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				completed: true,
				skipped_whole: false,
				proof_url: null,
			}),
		});

		await loadNextRunState(runId);
	}

	async function handleSubmitWithProof() {
		if (!runId || !challenge) return;

		// ⭐ Immediately show loading screen
		setLoading(true);

		try {
			const url = await uploadProof();

			await fetch(`${API_BASE}/runs/${runId}/submit-step`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					completed: true,
					skipped_whole: false,
					proof_url: url,
				}),
			});

			await loadNextRunState(runId);
		} catch (err) {
			// ⭐ If upload fails, re-enable UI instead of leaving it on loading
			setLoading(false);

			alert("Upload failed — please try again.");
		}
	}

	// function isVideo(url: string) {
	// 	console.log(url);
	// 	return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
	// }

	function finalizeRun() {
		if (!runId) return;
		localStorage.setItem("last_run_id", runId); // <-- NEW
		localStorage.removeItem("current_run_id");
	}

	// Cleanup preview on unmount
	useEffect(() => {
		return () => {
			if (preview) URL.revokeObjectURL(preview);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// --------------------------------------------
	// Render
	// --------------------------------------------
	if (loading) {
		// Match LoaderWrapper visual style
		return (
			<div className="min-h-screen flex items-center justify-center text-neutral-300 font-['VT323'] text-4xl">
				<p className="animate-[flicker_1.4s_steps(2)_infinite] tracking-widest">LOADING…</p>
			</div>
		);
	}

	if (!challenge) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center text-neutral-500 font-['VT323'] text-3xl text-center gap-4">
				Run finished.
				<button
					className="text-neutral-300 underline font-mono text-lg"
					onClick={() => (window.location.href = "/summary")}
				>
					View Summary
				</button>
			</div>
		);
	}

	return (
		<div className="w-full min-h-screen flex items-center justify-center px-4 text-center font-['VT323'] text-neutral-100">
			{loading && <LoadingOverlay />}

			<div className="w-full max-w-md space-y-10">
				<p className="text-neutral-500 font-mono tracking-wide">LEVEL {challenge.level_number}</p>

				<h2 className="text-5xl tracking-tight drop-shadow-[0_0_8px_rgba(0,140,255,0.3)]">{challenge.title}</h2>

				<p className="text-neutral-400 text-lg leading-relaxed font-mono">{challenge.description}</p>

				{/* Timer (only on main step) */}
				{!showUploadStep && <div className="text-5xl font-bold text-yellow-400">{formatTime(timeLeft)}</div>}

				{/* MAIN STEP */}
				{!showUploadStep && (
					<div className="flex flex-col items-center gap-2 mt-4">
						<button onClick={handleDone} className={buttonPrimary}>
							DONE
						</button>

						{skipsUsed < MAX_SKIPS && (
							<button
								onClick={handleSkipChallenge}
								className="text-neutral-400 hover:text-neutral-200 underline text-lg font-mono"
							>
								Skip challenge ({MAX_SKIPS - skipsUsed} left)
							</button>
						)}

						<button
							onClick={handleGiveUp}
							className="text-neutral-500 hover:text-neutral-200 underline text-sm font-mono mt-1"
						>
							Give up &amp; end run
						</button>
					</div>
				)}

				{/* PROOF STEP */}
				{showUploadStep && (
					<div className="space-y-6 mt-6">
						<p className="text-neutral-400 text-sm font-mono">Upload proof (optional)</p>

						<label className="flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-neutral-600 rounded-xl cursor-pointer hover:border-blue-400 bg-neutral-900/40 transition">
							<input type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />

							{preview ? (
								previewType?.startsWith("video/") ? (
									<video src={preview} className="h-full object-contain" controls muted playsInline />
								) : (
									<img src={preview} className="h-full object-contain" />
								)
							) : (
								<span className="text-neutral-500 text-xl font-mono">Tap to upload proof</span>
							)}
						</label>

						<div className="flex flex-col items-center gap-3">
							{preview && (
								<button onClick={handleSubmitWithProof} className={buttonPrimary}>
									NEXT
								</button>
							)}

							<button
								onClick={handleSkipProof}
								className="text-neutral-400 hover:text-neutral-200 underline text-lg font-mono"
							>
								Skip proof
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
