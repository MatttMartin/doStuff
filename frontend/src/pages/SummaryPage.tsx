// src/pages/SummaryPage.tsx
import { useEffect, useRef, useState } from "react";
import RunCarousel from "../components/RunCarousel";
import type { StepItem } from "../components/RunCarousel";
import LoadingScreen from "../components/LoadingScreen";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const CONTENT_MAX_WIDTH = "w-full max-w-md sm:max-w-lg md:max-w-xl mx-auto";

export default function SummaryPage() {
	const [steps, setSteps] = useState<StepItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [runId, setRunId] = useState<string | null>(null);
	const [isPublic, setIsPublic] = useState<boolean>(true);
	const [caption, setCaption] = useState<string>("");
	const [nickname, setNickname] = useState<string>("");
	const [userId, setUserId] = useState<string | null>(null);
	const postButtonRef = useRef<HTMLButtonElement | null>(null);
	const [postButtonWidth, setPostButtonWidth] = useState(0);
	const defaultCoverAttempted = useRef(false);
	const hasSummary = runId !== null && steps.length > 0;
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	useEffect(() => {
		defaultCoverAttempted.current = false;
	}, [runId]);

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
				setCaption(runJson.caption ?? "");
				setNickname(runJson.username ?? "Anonymous");
				setUserId(runJson.user_id ?? null);
			} catch (err) {
				console.error("Failed to load run summary", err);
			}
			setLoading(false);
		}

		load();
	}, []);

	useEffect(() => {
		function updatePostButtonWidth() {
			if (postButtonRef.current) {
				setPostButtonWidth(postButtonRef.current.offsetWidth);
			}
		}

		updatePostButtonWidth();
		window.addEventListener("resize", updatePostButtonWidth);
		return () => window.removeEventListener("resize", updatePostButtonWidth);
	}, []);

	// -----------------------------
	// Backend actions
	// -----------------------------
	async function updateRun(payload: Record<string, unknown>) {
		if (!runId) return;

		try {
			await fetch(`${API_BASE}/runs/${runId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
		} catch (err) {
			console.error("Failed to update run metadata:", err);
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

	async function handleSetCover(stepId: number) {
		if (!runId) return;

		setSteps((prev) =>
			prev.map((step) => ({
				...step,
				is_cover: step.id === stepId,
			}))
		);

		try {
			await fetch(`${API_BASE}/runs/${runId}/cover-step`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ step_id: stepId }),
			});
		} catch (err) {
			console.error("Failed to set cover photo:", err);
			setSteps((prev) =>
				prev.map((step) => ({
					...step,
					is_cover: step.id === stepId ? false : step.is_cover,
				}))
			);
		}
	}

	// -----------------------------
	// UI handlers
	// -----------------------------
	function handleVisibilityChange(nextValue: boolean) {
		setIsPublic(nextValue);
		updateRun({ public: nextValue });
	}

	async function handlePost() {
		if (!runId || !userId) return;

		await updateRun({ public: isPublic, caption });

		const trimmedNickname = nickname.trim() || "Anonymous";
		setNickname(trimmedNickname);

		try {
			await fetch(`${API_BASE}/users/${userId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username: trimmedNickname }),
			});
		} catch (err) {
			console.error("Failed to update username:", err);
		}

		// optional: call finish endpoint again (does nothing if already finished)
		await fetch(`${API_BASE}/runs/${runId}/finish`, { method: "POST" });

		window.location.href = "/feed";
	}

	function handleDeleteClick() {
		setShowDeleteConfirm(true);
	}

	function handleConfirmDelete() {
		setShowDeleteConfirm(false);
		deleteRun();
	}

	function handleCancelDelete() {
		setShowDeleteConfirm(false);
	}

	useEffect(() => {
		if (!showDeleteConfirm) return;

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setShowDeleteConfirm(false);
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [showDeleteConfirm]);

	useEffect(() => {
		if (!runId) return;
		if (steps.length === 0) return;
		if (steps.some((s) => s.is_cover)) return;
		if (defaultCoverAttempted.current) return;

		const candidate = steps.find((s) => s.proof_url);
		if (!candidate) return;

		defaultCoverAttempted.current = true;
		handleSetCover(candidate.id);
	}, [runId, steps]);

	useEffect(() => {
		if (!loading && !hasSummary) {
			window.location.href = "/feed";
		}
	}, [loading, hasSummary]);

	// -----------------------------
	// Render
	// -----------------------------
	if (loading || !hasSummary) {
		return <LoadingScreen />;
	}

	const coverStepId = steps.find((s) => s.is_cover)?.id ?? null;
	const coverIndex = coverStepId ? steps.findIndex((s) => s.id === coverStepId) : -1;
	const initialCarouselIndex = coverIndex >= 0 ? coverIndex : 0;

	return (
		<>
			<div className="min-h-screen w-full px-4 py-4 flex flex-col items-center text-neutral-100 font-['VT323']">
				<h1 className="text-3xl sm:text-4xl md:text-5xl mb-2 tracking-[0.3em] text-center drop-shadow-[0_0_12px_rgba(255,255,255,0.35)]">
					RUN SUMMARY
				</h1>

				<div className="w-full max-w-2xl flex flex-col items-center gap-3">
					<div className={CONTENT_MAX_WIDTH}>
						<RunCarousel
							steps={steps}
							initialIndex={initialCarouselIndex}
							coverStepId={coverStepId}
							onSetCover={handleSetCover}
						/>
					</div>

					<div className={CONTENT_MAX_WIDTH}>
						<label htmlFor="nickname" className="block text-sm uppercase tracking-[0.3em] text-neutral-500 mb-1">
							Nickname
						</label>
						<input
							id="nickname"
							type="text"
							value={nickname}
							onChange={(e) => setNickname(e.target.value)}
							placeholder="Anonymous"
							className="w-full rounded-2xl bg-black/60 border border-neutral-800 px-4 py-3 text-lg text-neutral-100 focus:outline-none focus:border-cyan-300 focus:ring-1 focus:ring-cyan-400 transition-all"
						/>
						<p className="mt-0.5 text-xs font-mono text-neutral-500">Leave blank to post as Anonymous.</p>
					</div>

					<div className={CONTENT_MAX_WIDTH}>
						<label htmlFor="caption" className="block text-sm uppercase tracking-[0.3em] text-neutral-500 mb-1">
							Caption
						</label>
						<textarea
							id="caption"
							value={caption}
							onChange={(e) => setCaption(e.target.value)}
							placeholder="Tell everyone about your run..."
							className="w-full min-h-[110px] rounded-2xl bg-black/60 border border-neutral-800 px-4 py-3 text-lg text-neutral-100 focus:outline-none focus:border-cyan-300 focus:ring-1 focus:ring-cyan-400 transition-all resize-none"
						/>
					</div>

					<div className={`${CONTENT_MAX_WIDTH} relative mt-1 flex items-center justify-center`}>
						<button
							type="button"
							onClick={handleDeleteClick}
							className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-red-500 hover:text-red-300 transition-transform duration-150 hover:scale-110"
							style={{
								left: postButtonWidth ? `calc(25% - ${postButtonWidth / 4}px)` : "20%",
							}}
							aria-label="Delete run"
						>
							<svg viewBox="0 0 16 16" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.2">
								<rect x="4" y="5" width="8" height="9" rx="1" />
								<path d="M3 5h10" />
								<path d="M6 3h4l1 2H5z" />
								<path d="M7 7v5" />
								<path d="M9 7v5" />
							</svg>
						</button>

						<button
							type="button"
							onClick={handlePost}
							ref={postButtonRef}
							className="
            px-20 py-3
            bg-neutral-900 border border-neutral-700 rounded-xl
            text-lg sm:text-xl tracking-widest
            font-['VT323'] text-neutral-100
            hover:border-cyan-400 hover:shadow-[0_0_18px_rgba(0,255,255,0.35)]
            transition-all duration-200
          "
						>
							POST
						</button>
					</div>

					{/* Public/Private toggle */}
					<div className="mt-0.5 flex items-center justify-center gap-2 text-xs sm:text-sm font-mono">
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

			{showDeleteConfirm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
					<div className="w-full max-w-sm mx-4 rounded-2xl border border-neutral-800 bg-gradient-to-b from-neutral-900 via-black to-neutral-950 text-neutral-100 shadow-[0_0_25px_rgba(0,0,0,0.6)] p-6 space-y-4">
						<div className="space-y-1 text-center">
							<h2 className="text-2xl tracking-[0.2em]">Delete Run?</h2>
							<p className="text-neutral-400 text-base leading-relaxed">
								This will permanently remove your run and all steps.
							</p>
						</div>

						<div className="flex flex-col sm:flex-row gap-3">
							<button
								type="button"
								onClick={handleCancelDelete}
								className="flex-1 rounded-xl border border-neutral-700 bg-black/60 py-3 text-lg tracking-[0.3em] hover:border-neutral-500 transition-colors"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleConfirmDelete}
								className="flex-1 rounded-xl border border-red-500 bg-red-600/20 py-3 text-lg tracking-[0.3em] text-red-300 hover:bg-red-600/30 hover:border-red-300 transition-colors shadow-[0_0_15px_rgba(255,0,0,0.25)]"
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
