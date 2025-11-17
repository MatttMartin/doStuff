import React, { useEffect, useState } from "react";

type Level = {
	id: number;
	title: string;
	description?: string | null;
	seconds_limit?: number | null;
};

const API_BASE = import.meta.env.VITE_API_BASE as string;

// shared primary button style
const buttonPrimary =
	"w-full py-4 rounded-xl font-['VT323'] text-3xl tracking-wide " +
	"bg-neutral-900/60 backdrop-blur-sm border border-neutral-700/80 " +
	"hover:border-blue-400 hover:bg-neutral-900/80 " +
	"transition-all duration-200 " +
	"shadow-[inset_0_0_8px_rgba(255,255,255,0.08),0_0_6px_rgba(0,0,0,0.4)] " +
	"hover:shadow-[inset_0_0_12px_rgba(255,255,255,0.12),0_0_12px_rgba(0,140,255,0.35)]";

export default function ChallengePage() {
	const [levels, setLevels] = useState<Level[]>([]);
	const [index, setIndex] = useState(0);
	const [timeLeft, setTimeLeft] = useState(0);
	const [runId, setRunId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	// upload step state
	const [showUploadStep, setShowUploadStep] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);

	const challenge = levels[index] ?? null;

	// ------------------------------------------------
	// Initial load: user id, levels, run
	// ------------------------------------------------
	useEffect(() => {
		async function init() {
			// Wordle-style anonymous user id
			let uid = localStorage.getItem("user_id");
			if (!uid) {
				uid = crypto.randomUUID();
				localStorage.setItem("user_id", uid);
			}

			try {
				// 1. Load levels
				const res = await fetch(`${API_BASE}/levels`);
				const data: Level[] = await res.json();
				setLevels(data);

				if (data.length > 0) {
					setTimeLeft(data[0].seconds_limit ?? 60);
				}

				// 2. Create run
				const runRes = await fetch(`${API_BASE}/runs`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						user_id: uid,
						caption: null,
						public: true,
					}),
				});

				const runJson = await runRes.json();
				setRunId(runJson.id);
			} catch (err) {
				console.error("Error initializing challenge page:", err);
			} finally {
				setLoading(false);
			}
		}

		init();
	}, []);

	// ------------------------------------------------
	// Timer: auto-skip when hitting 0, but never on proof screen
	// ------------------------------------------------
	useEffect(() => {
		if (!challenge) return;
		if (showUploadStep) return;

		if (timeLeft <= 0) {
			// time’s up → skip this challenge
			handleSkipChallenge();
			return;
		}

		const timer = setInterval(() => {
			setTimeLeft((t) => t - 1);
		}, 1000);

		return () => clearInterval(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [challenge, timeLeft, showUploadStep]);

	function formatTime(sec: number) {
		const m = Math.floor(sec / 60)
			.toString()
			.padStart(2, "0");
		const s = (sec % 60).toString().padStart(2, "0");
		return `${m}:${s}`;
	}

	// ------------------------------------------------
	// File handling
	// ------------------------------------------------
	function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0];
		if (!f) return;
		setFile(f);
		if (preview) URL.revokeObjectURL(preview);
		setPreview(URL.createObjectURL(f));
	}

	// ------------------------------------------------
	// Save step helper
	// ------------------------------------------------
	async function saveStep(opts: { completed: boolean; skipWhole?: boolean }) {
		if (!runId || !challenge) return;

		let proofUrl: string | null = null;

		// Whole-challenge skip: mark specially
		if (!opts.completed && opts.skipWhole) {
			proofUrl = "SKIPPED_CHALLENGE";
		}

		// Completed with proof (upload file)
		if (opts.completed && file) {
			const fd = new FormData();
			fd.append("file", file);

			const uploadRes = await fetch(`${API_BASE}/upload`, {
				method: "POST",
				body: fd,
			});

			const uploadJson = await uploadRes.json();
			proofUrl = uploadJson.url;
		}

		await fetch(`${API_BASE}/runs/${runId}/steps`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				level_id: challenge.id,
				completed: opts.completed,
				proof_url: proofUrl,
			}),
		});
	}

	// ------------------------------------------------
	// Flow control
	// ------------------------------------------------
	async function handleSkipChallenge() {
		if (!challenge) return;
		// Skip entire challenge, record as skipped
		await saveStep({ completed: false, skipWhole: true });
		goToNext();
	}

	function handleDone() {
		// Move to upload/confirmation step, hide/stop timer
		setShowUploadStep(true);
		setTimeLeft(0);
	}

	async function handleSkipProof() {
		// User says "Done" but no proof → completed=true, proof_url=null
		await saveStep({ completed: true, skipWhole: false });
		goToNext();
	}

	async function handleNextWithProof() {
		// Done + uploaded proof
		await saveStep({ completed: true, skipWhole: false });
		goToNext();
	}

	function goToNext() {
		setShowUploadStep(false);

		// clean up file preview
		if (preview) URL.revokeObjectURL(preview);
		setPreview(null);
		setFile(null);

		const nextIndex = index + 1;

		// next level or finished
		if (nextIndex < levels.length) {
			setIndex(nextIndex);
			const next = levels[nextIndex];
			setTimeLeft(next.seconds_limit ?? 60);
		} else {
			alert("You completed all challenges!");
			// mark as finished by moving index past array so challenge becomes null
			setIndex(nextIndex);
			setTimeLeft(0);
		}
	}

	// ------------------------------------------------
	// Loading / empty states
	// ------------------------------------------------
	if (loading || !runId) {
		return (
			<div className="min-h-screen flex items-center justify-center text-neutral-300 font-['VT323'] text-4xl">
				<p className="animate-[flicker_1.4s_steps(2)_infinite] tracking-widest">LOADING…</p>
			</div>
		);
	}

	if (!challenge) {
		return (
			<div className="min-h-screen flex items-center justify-center text-neutral-400 font-['VT323'] text-2xl">
				No challenges configured yet.
			</div>
		);
	}

	// ------------------------------------------------
	// Main render
	// ------------------------------------------------
	return (
		<div className="w-full min-h-screen flex items-center justify-center px-4 text-center font-['VT323'] text-neutral-100">
			<div className="w-full max-w-md space-y-10">
				{/* Level label */}
				<p className="text-neutral-500 font-mono tracking-wide">LEVEL {index + 1}</p>

				{/* Title */}
				<h2 className="text-5xl tracking-tight drop-shadow-[0_0_8px_rgba(0,140,255,0.3)]">{challenge.title}</h2>

				{/* Description */}
				<p className="text-neutral-400 text-lg leading-relaxed font-mono">{challenge.description}</p>

				{/* Timer — only show during challenge step */}
				{!showUploadStep && <div className="text-5xl font-bold text-yellow-400">{formatTime(timeLeft)}</div>}

				{/* STEP 1: main DONE + Skip challenge */}
				{!showUploadStep && (
					<div className="flex flex-col items-center gap-3 mt-4">
						{/* PRIMARY BUTTON */}
						<button onClick={handleDone} className={buttonPrimary}>
							DONE
						</button>

						{/* SKIP TEXT LINK */}
						<button
							onClick={handleSkipChallenge}
							className="text-neutral-400 hover:text-neutral-200 underline text-lg font-mono transition"
						>
							Skip challenge
						</button>
					</div>
				)}

				{/* STEP 2: proof upload */}
				{showUploadStep && (
					<div className="space-y-6 mt-6">
						<p className="text-neutral-400 text-sm font-mono text-center">Upload proof (optional)</p>

						{/* Upload box */}
						<label
							className="
                flex flex-col items-center justify-center w-full h-56
                border-2 border-dashed border-neutral-600
                rounded-xl cursor-pointer
                hover:border-blue-400 transition
                bg-neutral-900/40
              "
						>
							<input type="file" className="hidden" onChange={handleFile} />

							{preview ? (
								<img src={preview} className="h-full object-contain rounded-xl" />
							) : (
								<span className="text-neutral-500 text-xl font-mono">Tap to upload proof</span>
							)}
						</label>

						{/* Buttons */}
						<div className="flex flex-col items-center gap-3">
							{preview && (
								<button onClick={handleNextWithProof} className={buttonPrimary}>
									NEXT
								</button>
							)}

							{/* Always allow skipping proof */}
							<button
								onClick={handleSkipProof}
								className="text-neutral-400 hover:text-neutral-200 underline text-lg font-mono transition"
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
