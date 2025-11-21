import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "../components/LoadingScreen";

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
	"w-full rounded-2xl border border-neutral-700 bg-black/70 px-8 py-4 text-3xl tracking-[0.3em] " +
	"text-neutral-100 font-['VT323'] transition-all duration-200 shadow-[0_0_20px_rgba(0,0,0,0.35)] " +
	"hover:border-cyan-400 hover:text-cyan-200 hover:shadow-[0_0_25px_rgba(0,255,255,0.35)] " +
	"focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

const MAX_SKIPS = 1;

// --------------------------------------------
// Component
// --------------------------------------------
export default function ChallengePage() {
	const navigate = useNavigate();
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

	async function fetchRunState(rid: string): Promise<RunState | null> {
		try {
			const res = await fetch(`${API_BASE}/runs/${rid}`);
			if (!res.ok) return null;
			return (await res.json()) as RunState;
		} catch (err) {
			console.error(err);
			return null;
		}
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

			// 2. If there's a finished run waiting to be posted/deleted, send them to summary first
			const completedRunId = localStorage.getItem("last_run_id");
			if (completedRunId) {
				const completedRun = await fetchRunState(completedRunId);
				if (completedRun?.finished_at) {
					setRunId(completedRunId);
					setSkipsUsed(completedRun.skips_used ?? 0);
					setChallenge(null);
					setShowUploadStep(false);
					setTimeLeft(0);
					setLoading(false);
					navigate("/summary", { replace: true });
					return;
				}

				if (!completedRun) {
					localStorage.removeItem("last_run_id");
				}
			}

			// 3. Ensure we have a current run id (or restore existing)
			let storedRun = localStorage.getItem("current_run_id") ?? "";
			let run: RunState | null = null;

			if (storedRun) {
				run = await fetchRunState(storedRun);

				if (!run) {
					localStorage.removeItem("current_run_id");
					storedRun = "";
				} else if (run.finished_at) {
					setRunId(storedRun);
					setSkipsUsed(run.skips_used ?? 0);
					setChallenge(null);
					setShowUploadStep(false);
					setTimeLeft(0);
					finalizeRun(storedRun);
					setLoading(false);
					return;
				}
			}

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

			if (!run) {
				const runRes = await fetch(`${API_BASE}/runs/${storedRun}`);
				run = (await runRes.json()) as RunState;
			}

			if (!run) {
				setLoading(false);
				return;
			}

			// If run finished, just show finished screen
			if (run.finished_at) {
				setChallenge(null);
				setSkipsUsed(run.skips_used ?? 0);
				setShowUploadStep(false);
				setTimeLeft(0);
				setLoading(false);
				finalizeRun(storedRun);
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

	function finalizeRun(completedId?: string | null) {
		const targetId = completedId ?? runId;
		if (!targetId) return;
		localStorage.setItem("last_run_id", targetId);
		localStorage.removeItem("current_run_id");
	}

	// Cleanup preview on unmount
	useEffect(() => {
		return () => {
			if (preview) URL.revokeObjectURL(preview);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!loading && !challenge) {
			navigate("/summary", { replace: true });
		}
	}, [loading, challenge, navigate]);

	// --------------------------------------------
	// Render
	// --------------------------------------------
	if (loading || !challenge) {
		return <LoadingScreen />;
	}

	const displayTimeLeft = Math.max(0, timeLeft);
	const skipsRemaining = Math.max(0, MAX_SKIPS - skipsUsed);

	return (
		<div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-black via-neutral-950 to-black px-4 py-10 text-neutral-100 font-['VT323']">
			<div
				className="absolute inset-0 pointer-events-none opacity-30"
				style={{
					backgroundImage:
						"radial-gradient(circle at 20% 20%, rgba(0,255,255,0.2), transparent 55%), radial-gradient(circle at 85% 10%, rgba(255,0,153,0.18), transparent 50%)",
				}}
			/>
			<div
				className="absolute inset-0 pointer-events-none opacity-[0.08]"
				style={{
					backgroundImage:
						"linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
					backgroundSize: "80px 80px",
				}}
			/>

			<div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-8 text-center">
				<div className="space-y-4">
					<p className="text-xs uppercase tracking-[0.6em] text-neutral-500">LEVEL {challenge.level_number}</p>
					<h2 className="text-4xl sm:text-5xl md:text-6xl drop-shadow-[0_0_18px_rgba(0,140,255,0.35)]">
						{challenge.title}
					</h2>
					{challenge.description && (
						<p className="text-neutral-300 text-base sm:text-lg font-mono tracking-[0.3em] leading-relaxed">
							{challenge.description}
						</p>
					)}
				</div>

				{!showUploadStep && (
					<div className="grid gap-6 text-left">
						<div className="rounded-3xl border border-neutral-800 bg-black/60 p-6 backdrop-blur-sm shadow-[0_0_30px_rgba(0,0,0,0.35)] space-y-4">
							<div className="flex items-center justify-between text-xs font-mono uppercase tracking-[0.4em] text-neutral-500">
								<span>Time left</span>
								<span>Skips {skipsRemaining}</span>
							</div>
							<p className="text-5xl sm:text-6xl text-amber-300 drop-shadow-[0_0_18px_rgba(255,196,0,0.45)]">
								{formatTime(displayTimeLeft)}
							</p>
							<div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
								<span
									className="block h-full w-full bg-gradient-to-r from-orange-500 via-amber-200 to-orange-500 animate-[pulse_2s_linear_infinite]"
									aria-hidden
								/>
							</div>
							<p className="text-sm font-mono uppercase tracking-[0.3em] text-neutral-500">
								Get your camera out - proof upload comes next.
							</p>
						</div>

						<div className="rounded-3xl border border-neutral-800 bg-black/60 p-6 backdrop-blur-sm shadow-[0_0_30px_rgba(0,0,0,0.35)] space-y-4">
							<p className="text-neutral-300 text-sm font-mono tracking-[0.3em]">
								Complete the prompt before time hits zero.
							</p>
							<button onClick={handleDone} className={buttonPrimary}>
								DONE
							</button>

							{skipsUsed < MAX_SKIPS && (
								<button
									onClick={handleSkipChallenge}
									className="w-full rounded-2xl border border-neutral-800 bg-black/40 px-4 py-3 text-xs font-mono uppercase tracking-[0.4em] text-neutral-300 transition-colors duration-200 hover:border-cyan-400 hover:text-cyan-200"
								>
									Skip Challenge · {skipsRemaining} left
								</button>
							)}

							<button
								onClick={handleGiveUp}
								className="w-full rounded-2xl border border-transparent px-4 py-3 text-xs font-mono uppercase tracking-[0.4em] text-red-300 transition-colors duration-200 hover:text-red-200"
							>
								Give up &amp; end run
							</button>
						</div>
					</div>
				)}

				{showUploadStep && (
					<div className="grid gap-6 text-left">
						<label className="relative flex min-h-[18rem] w-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-neutral-700 bg-black/40 p-6 text-center font-mono tracking-[0.2em] text-neutral-400 transition hover:border-cyan-400">
							<input type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
							{preview ? (
								previewType?.startsWith("video/") ? (
									<video
										src={preview}
										className="h-full w-full max-h-64 rounded-2xl border border-neutral-800 object-contain"
										controls
										muted
										playsInline
									/>
								) : (
									<img
										src={preview}
										className="h-full w-full max-h-64 rounded-2xl border border-neutral-800 object-contain"
										alt="Proof preview"
									/>
								)
							) : (
								<>
									<span className="text-sm uppercase tracking-[0.5em] text-neutral-500">Proof Upload</span>
									<span>Tap to upload photo/video</span>
								</>
							)}
						</label>

						<div className="rounded-3xl border border-neutral-800 bg-black/60 p-6 backdrop-blur-sm shadow-[0_0_30px_rgba(0,0,0,0.35)] space-y-4">
							<p className="text-neutral-300 text-sm font-mono tracking-[0.3em]">Lock in your run with evidence.</p>

							{preview ? (
								<>
									<button onClick={handleSubmitWithProof} className={buttonPrimary}>
										NEXT
									</button>
									<button
										type="button"
										onClick={clearProofPreview}
										className="w-full rounded-2xl border border-neutral-800 bg-black/40 px-4 py-3 text-xs font-mono uppercase tracking-[0.4em] text-neutral-300 transition-colors duration-200 hover:border-cyan-400 hover:text-cyan-200"
									>
										Remove file
									</button>
								</>
							) : (
								<></>
							)}

							<button
								onClick={handleSkipProof}
								className="w-full rounded-2xl border border-transparent px-4 py-3 text-xs font-mono uppercase tracking-[0.4em] text-red-300 transition-colors duration-200 hover:text-red-200"
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
