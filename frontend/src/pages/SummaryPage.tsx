// src/pages/SummaryPage.tsx
import { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";

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
	const [runId, setRunId] = useState<string | null>(null);
	const [isPublic, setIsPublic] = useState<boolean>(true);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const [emblaRef, emblaApi] = useEmblaCarousel({
		loop: false,
		align: "center",
		dragFree: false,
	});

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
	// Embla selection
	// -----------------------------
	const onSelect = useCallback(() => {
		if (!emblaApi) return;
		setSelectedIndex(emblaApi.selectedScrollSnap());
	}, [emblaApi]);

	useEffect(() => {
		if (!emblaApi) return;
		onSelect();
		emblaApi.on("select", onSelect);
	}, [emblaApi, onSelect]);

	const scrollPrev = () => emblaApi && emblaApi.scrollPrev();
	const scrollNext = () => emblaApi && emblaApi.scrollNext();
	const scrollTo = (index: number) => emblaApi && emblaApi.scrollTo(index);

	// -----------------------------
	// Actions
	// -----------------------------
	function handleVisibilityChange(nextPublic: boolean) {
		setIsPublic(nextPublic);
		// later: backend update for Run.public
	}

	function handlePost() {
		if (!runId) return;
		alert(
			`Pretend this run has been ${isPublic ? "posted publicly" : "saved as private"}. (Backend hook goes here later.)`
		);
	}

	function handleDelete() {
		if (!runId) return;
		const ok = confirm("Delete this run from this device?");
		if (!ok) return;

		localStorage.removeItem("last_run_id");
		localStorage.removeItem("current_run_id");
		window.location.href = "/";
	}

	// -----------------------------
	// Render helpers
	// -----------------------------
	// function formatStatus(step: StepItem) {
	// 	if (!step.completed && !step.skipped_whole) return "Timed out / Failed";
	// 	if (step.skipped_whole) return "Skipped";
	// 	return "Completed";
	// }

	// function formatDate(iso: string | null) {
	// 	if (!iso) return "";
	// 	return iso.replace("T", " ").slice(0, 16);
	// }

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
		<div className="min-h-screen w-full px-4 py-5 flex flex-col items-center text-neutral-100 font-['VT323']">
			<h1 className="text-3xl sm:text-4xl md:text-5xl mb-4 tracking-[0.3em] text-center drop-shadow-[0_0_12px_rgba(255,255,255,0.35)]">
				RUN SUMMARY
			</h1>

			<div className="w-full max-w-4xl flex flex-col items-center gap-2 md:gap-3">
				{/* Slider + arrows */}
				<div className="relative w-full max-w-md sm:max-w-lg md:max-w-xl pb-2 mx-auto">
					{/* Embla viewport */}
					<div className="overflow-hidden" ref={emblaRef}>
						<div className="flex">
							{steps.map((s, idx) => (
								<div key={idx} className="flex-[0_0_100%] px-1 sm:px-2">
									<div className="bg-neutral-950/80 border border-neutral-800/90 rounded-3xl px-4 sm:px-5 pt-5 pb-3 shadow-[0_0_18px_rgba(0,0,0,0.8)]">
										<p className="text-[11px] text-neutral-500 tracking-[0.2em] mb-1">LEVEL {s.level_number ?? "?"}</p>

										<h2 className="text-2xl sm:text-[1.65rem] text-neutral-50 mb-1">
											{s.title ?? "Untitled challenge"}
										</h2>

										<p className="text-[13px] sm:text-sm text-neutral-400 font-mono mb-2">{s.description ?? ""}</p>

										<div className="mt-2 mb-2 rounded-2xl border border-neutral-800 bg-neutral-900/70 overflow-hidden h-60 md:h-64 flex items-center justify-center">
											{s.proof_url ? (
												<img src={s.proof_url} className="w-full h-full object-contain" />
											) : (
												<div className="text-neutral-600 font-mono text-xs">no proof</div>
											)}
										</div>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Desktop arrows */}
					{steps.length > 1 && (
						<>
							<button
								type="button"
								onClick={scrollPrev}
								className="hidden md:flex items-center justify-center absolute top-1/2 -translate-y-1/2 -left-16 w-10 h-10 rounded-full border border-neutral-700 bg-black/70 hover:border-neutral-100 hover:bg-neutral-900/90 transition-all shadow-[0_0_12px_rgba(0,0,0,0.8)]"
								aria-label="Previous challenge"
							>
								<span className="text-lg">{`‹`}</span>
							</button>

							<button
								type="button"
								onClick={scrollNext}
								className="hidden md:flex items-center justify-center absolute top-1/2 -translate-y-1/2 -right-16 w-10 h-10 rounded-full border border-neutral-700 bg-black/70 hover:border-neutral-100 hover:bg-neutral-900/90 transition-all shadow-[0_0_12px_rgba(0,0,0,0.8)]"
								aria-label="Next challenge"
							>
								<span className="text-lg">{`›`}</span>
							</button>
						</>
					)}

					{/* Dots row + trash icon (trash doesn't affect centering) */}
					<div className="mt-2 relative flex items-center justify-center">
						{/* Trash – anchored to left, dots stay perfectly centered */}
						<button
							type="button"
							onClick={handleDelete}
							className="absolute left-6 sm:left-4 flex items-center justify-center p-1 text-red-500 hover:text-red-300 transition-transform duration-150 hover:scale-110"
							aria-label="Delete run"
						>
							<svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.2">
								<rect x="4" y="5" width="8" height="9" rx="1" />
								<path d="M3 5h10" />
								<path d="M6 3h4l1 2H5z" />
								<path d="M7 7v5" />
								<path d="M9 7v5" />
							</svg>
						</button>

						{/* Centered dots */}
						{steps.length > 1 && (
							<div className="flex justify-center gap-2">
								{steps.map((_, i) => (
									<button
										key={i}
										type="button"
										onClick={() => scrollTo(i)}
										className={
											"w-2 h-2 rounded-full transition-all duration-200 " +
											(i === selectedIndex
												? "bg-cyan-400 shadow-[0_0_8px_rgba(0,255,255,0.75)] scale-110"
												: "bg-neutral-700 hover:bg-neutral-400")
										}
										aria-label={`Go to challenge ${i + 1}`}
									/>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Post button – spacing tightened */}
				<button
					type="button"
					onClick={handlePost}
					className="
						mt-0 px-20 sm:px-24 py-3
						bg-neutral-900 border border-neutral-700 rounded-xl
						text-lg sm:text-xl tracking-widest
						font-['VT323'] text-neutral-100
						hover:border-cyan-400 hover:shadow-[0_0_18px_rgba(0,255,255,0.35)]
						transition-all duration-200
					"
				>
					POST
				</button>

				{/* Public / Private toggle – slightly closer now */}
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
						className="px-2 py-[3px] border border-neutral-700 rounded-md bg-black/80 flex items-center justify-between w-12"
						aria-label="Toggle public/private"
					>
						<div
							className={
								"w-4 h-4 rounded-sm bg-neutral-200 border border-neutral-700 transition-transform duration-200 " +
								(isPublic ? "translate-x-4" : "translate-x-0")
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
