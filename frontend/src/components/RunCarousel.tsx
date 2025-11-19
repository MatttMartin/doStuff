// src/components/RunCarousel.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";

export interface StepItem {
	level_number: number | null;
	title: string | null;
	description: string | null;
	completed: boolean;
	skipped_whole: boolean;
	proof_url: string | null;
	completed_at: string | null;
}

interface RunCarouselProps {
	steps: StepItem[];
	/** show red trash icon (used on Summary page) */
	showDelete?: boolean;
	/** called when trash icon is clicked */
	onDelete?: () => void;
	/**
	 * If false, videos will NOT autoplay, even when this carousel slide is active.
	 * FeedPage will use this to only autoplay on the card that's actually visible.
	 * Defaults to true (safe for SummaryPage, etc.).
	 */
	autoPlayActive?: boolean;
}

// Guess if a URL looks like a video (matches backend extensions)
function isVideoUrl(url: string | null): boolean {
	if (!url) return false;
	return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}

export default function RunCarousel({ steps, showDelete = false, onDelete, autoPlayActive = true }: RunCarouselProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [muteMap, setMuteMap] = useState<Record<number, boolean>>({});
	const [indicatorMap, setIndicatorMap] = useState<Record<number, "muted" | "unmuted">>({});
	const [emblaRef, emblaApi] = useEmblaCarousel({
		loop: false,
		align: "center",
		dragFree: false,
	});

	const onSelect = useCallback(() => {
		if (!emblaApi) return;
		setSelectedIndex(emblaApi.selectedScrollSnap());
	}, [emblaApi]);

useEffect(() => {
	if (!emblaApi) return;
	onSelect();
	emblaApi.on("select", onSelect);
}, [emblaApi, onSelect]);

useEffect(() => {
	return () => {
		Object.values(indicatorTimeouts.current).forEach((id) => window.clearTimeout(id));
		Object.values(holdTimeoutRef.current).forEach((id) => window.clearTimeout(id));
	};
}, []);

	const scrollPrev = () => emblaApi && emblaApi.scrollPrev();
	const scrollNext = () => emblaApi && emblaApi.scrollNext();
	const scrollTo = (index: number) => emblaApi && emblaApi.scrollTo(index);

	function formatStatus(step: StepItem) {
		if (!step.completed && !step.skipped_whole) return "Timed out / Failed";
		if (step.skipped_whole) return "Skipped";
		return "Completed";
	}

	function formatDate(iso: string | null) {
		if (!iso) return "";
		return iso.replace("T", " ").slice(0, 16);
	}

	// ----- VIDEO INTERACTION HELPERS -----
	const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
	const indicatorTimeouts = useRef<Record<number, number>>({});
	const holdTimeoutRef = useRef<Record<number, number>>({});
	const holdActiveRef = useRef<Record<number, boolean>>({});
	const suppressClickRef = useRef<Record<number, boolean>>({});

	const ensureVideoPlaying = useCallback(
		(idx: number) => {
			const video = videoRefs.current[idx];
			if (!video) return;
			if (idx === selectedIndex && autoPlayActive) {
				video.play().catch(() => {
					/* autoplay blocked */
				});
			}
		},
		[selectedIndex, autoPlayActive]
	);

	const showIndicator = useCallback((idx: number, state: "muted" | "unmuted") => {
		setIndicatorMap((prev) => ({ ...prev, [idx]: state }));

		if (indicatorTimeouts.current[idx]) {
			window.clearTimeout(indicatorTimeouts.current[idx]);
			delete indicatorTimeouts.current[idx];
		}

		if (state === "unmuted") {
			indicatorTimeouts.current[idx] = window.setTimeout(() => {
				setIndicatorMap((prev) => {
					if (!(idx in prev)) return prev;
					const next = { ...prev };
					delete next[idx];
					return next;
				});
				delete indicatorTimeouts.current[idx];
			}, 1200);
		}
	}, []);

	const toggleMute = useCallback(
		(idx: number) => {
			setMuteMap((prev) => {
				const current = prev[idx] ?? true;
				const nextMuted = !current;
				const video = videoRefs.current[idx];
				if (video) {
					video.muted = nextMuted;
					if (!nextMuted) {
						ensureVideoPlaying(idx);
					}
				}
				showIndicator(idx, nextMuted ? "muted" : "unmuted");
				return { ...prev, [idx]: nextMuted };
			});
		},
		[showIndicator, ensureVideoPlaying]
	);

	const handlePointerDown = useCallback((idx: number) => {
		if (holdTimeoutRef.current[idx]) {
			window.clearTimeout(holdTimeoutRef.current[idx]);
		}

		holdTimeoutRef.current[idx] = window.setTimeout(() => {
			const video = videoRefs.current[idx];
			if (!video) return;
			holdActiveRef.current[idx] = true;
			suppressClickRef.current[idx] = true;
			video.pause();
		}, 150);
	}, []);

	const handlePointerRelease = useCallback((idx: number) => {
		if (holdTimeoutRef.current[idx]) {
			window.clearTimeout(holdTimeoutRef.current[idx]);
			delete holdTimeoutRef.current[idx];
		}

		if (holdActiveRef.current[idx]) {
			holdActiveRef.current[idx] = false;
			ensureVideoPlaying(idx);
			window.setTimeout(() => {
				delete suppressClickRef.current[idx];
			}, 0);
		}
	}, [ensureVideoPlaying]);

	const handleVideoClick = useCallback(
		(idx: number) => {
			if (suppressClickRef.current[idx]) {
				delete suppressClickRef.current[idx];
				return;
			}
			toggleMute(idx);
		},
		[toggleMute]
	);

	// Whenever the selected slide OR autoplay-allowed flag changes,
	// pause all videos and only play the one on the active slide (if any).
	useEffect(() => {
		// Pause everything if autoplay is not allowed for this carousel
		if (!autoPlayActive) {
			videoRefs.current.forEach((v) => v && v.pause());
			return;
		}

		videoRefs.current.forEach((v, idx) => {
			if (!v) return;
			if (idx === selectedIndex) {
				// Try to play the active slide; some browsers may block
				// autoplay with sound, so we keep it muted by default.
				v.play().catch(() => {
					// ignore autoplay errors
				});
			} else {
				v.pause();
			}
		});
	}, [selectedIndex, autoPlayActive]);

	if (!steps.length) return null;

	return (
		<div className="relative w-full max-w-md sm:max-w-lg md:max-w-xl pb-2 mx-auto">
			{/* Embla viewport */}
			<div className="overflow-hidden" ref={emblaRef}>
				<div className="flex">
					{steps.map((s, idx) => {
						const proofIsVideo = isVideoUrl(s.proof_url);
						const isMuted = muteMap[idx] ?? true;
						const indicatorState = proofIsVideo ? indicatorMap[idx] ?? (isMuted ? "muted" : null) : null;

						return (
							<div key={idx} className="flex-[0_0_100%] px-1 sm:px-2">
								<div className="bg-neutral-950/80 border border-neutral-800/90 rounded-3xl px-4 sm:px-5 pt-3 pb-3 shadow-[0_0_18px_rgba(0,0,0,0.8)]">
									<p className="text-[11px] text-neutral-500 tracking-[0.2em] mb-">LEVEL {s.level_number ?? "?"}</p>

									<h2 className="text-2xl sm:text-[1.65rem] text-neutral-50 mb-1">{s.title ?? "Untitled challenge"}</h2>

									{/* Reserve two lines worth of room for description */}
									<p className="text-[13px] sm:text-sm text-neutral-400 font-mono mb-2 min-h-[2.5rem]">
										{s.description ?? ""}
									</p>

									<div className="relative mt-2 mb-2 rounded-2xl border border-neutral-800 bg-neutral-900/70 overflow-hidden h-60 md:h-64 flex items-center justify-center">
										{s.proof_url ? (
											proofIsVideo ? (
												<video
													ref={(el) => {
														videoRefs.current[idx] = el;
													}}
													src={s.proof_url}
													className="w-full h-full object-contain select-none"
													autoPlay={autoPlayActive && idx === selectedIndex}
													playsInline
													muted={isMuted}
													preload="auto"
													loop
													draggable={false}
													onLoadedData={() => ensureVideoPlaying(idx)}
													onContextMenu={(e) => e.preventDefault()}
													style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
													onClick={() => handleVideoClick(idx)}
													onPointerDown={() => handlePointerDown(idx)}
													onPointerUp={() => handlePointerRelease(idx)}
													onPointerLeave={() => handlePointerRelease(idx)}
													onPointerCancel={() => handlePointerRelease(idx)}
												/>
											) : (
												<img src={s.proof_url} className="w-full h-full object-contain" />
											)
										) : (
											<div className="text-neutral-600 font-mono text-xs">no proof</div>
										)}

										{indicatorState && (
											<div
												className={
													"absolute top-2 right-2 rounded-full bg-black/75 text-white pointer-events-none " +
													(indicatorState === "muted" ? "p-2" : "p-2 animate-[indicatorFade_1.2s_ease_forwards]")
												}
											>
												{indicatorState === "muted" ? (
													<svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
														<path d="M4 7h3l4-3v12l-4-3H4z" />
														<path d="M14 6l4 8" />
														<path d="M18 6l-4 8" />
													</svg>
												) : (
													<svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
														<path d="M5 9h3l5-4v14l-5-4H5z" />
														<path d="M16 8c1.1 1 1.8 2.4 1.8 4s-.7 3-1.8 4" strokeLinecap="round" />
														<path d="M18.5 5c1.9 1.6 3.1 4 3.1 7s-1.2 5.4-3.1 7" strokeLinecap="round" />
													</svg>
												)}
											</div>
										)}
									</div>

									<p className="mt-1 text-[11px] text-neutral-400 font-mono">{formatStatus(s)}</p>
									<p className="mt-[2px] text-[11px] text-neutral-500 font-mono">{formatDate(s.completed_at)}</p>
								</div>
							</div>
						);
					})}
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

			{/* Bottom row: absolutely centered dots + optional trash on the left */}
			<div className="mt-2 relative h-6">
				{showDelete && (
					<button
						type="button"
						onClick={onDelete}
						className="absolute left-6 flex items-center justify-center text-red-500 hover:text-red-300 transition-transform duration-150 hover:scale-110"
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
				)}

				{steps.length > 1 && (
					<div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
						{steps.map((_, idx) => (
							<button
								key={idx}
								type="button"
								onClick={() => scrollTo(idx)}
								className={
									"w-2 h-2 rounded-full transition-all duration-200 " +
									(idx === selectedIndex
										? "bg-cyan-400 shadow-[0_0_8px_rgba(0,255,255,0.75)] scale-110"
										: "bg-neutral-700 hover:bg-neutral-400")
								}
								aria-label={`Go to challenge ${idx + 1}`}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
