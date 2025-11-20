// src/components/RunCarousel.tsx
import { useEffect, useState, useCallback, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";

export interface StepItem {
	id: number;
	level_number: number | null;
	title: string | null;
	description: string | null;
	completed: boolean;
	skipped_whole: boolean;
	proof_url: string | null;
	completed_at: string | null;
	is_cover?: boolean;
}

interface RunCarouselProps {
	steps: StepItem[];
	/**
	 * If false, videos will NOT autoplay, even when this carousel slide is active.
	 * FeedPage will use this to only autoplay on the card that's actually visible.
	 * Defaults to true (safe for SummaryPage, etc.).
	 */
	autoPlayActive?: boolean;
	initialIndex?: number;
	coverStepId?: number | null;
	onSetCover?: (stepId: number) => void;
}

// Guess if a URL looks like a video (matches backend extensions)
function isVideoUrl(url: string | null): boolean {
	if (!url) return false;
	return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}

const DEFAULT_CAROUSEL_ASPECT_RATIO = 4 / 3;

export default function RunCarousel({
	steps,
	autoPlayActive = true,
	initialIndex = 0,
	coverStepId = null,
	onSetCover,
}: RunCarouselProps) {
	const [selectedIndex, setSelectedIndex] = useState(initialIndex);
	const [muteMap, setMuteMap] = useState<Record<number, boolean>>({});
	const [indicatorMap, setIndicatorMap] = useState<Record<number, "muted" | "unmuted">>({});
	const [emblaRef, emblaApi] = useEmblaCarousel({
		loop: false,
		align: "center",
		dragFree: false,
		startIndex: initialIndex,
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
	if (!emblaApi) return;
	if (typeof initialIndex !== "number") return;
	emblaApi.scrollTo(initialIndex, true);
	setSelectedIndex(initialIndex);
}, [initialIndex, emblaApi]);

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
	const mediaAspectRatiosRef = useRef<Record<number, number>>({});
	const [carouselAspectRatio, setCarouselAspectRatio] = useState(DEFAULT_CAROUSEL_ASPECT_RATIO);

	const recomputeCarouselAspectRatio = useCallback(() => {
		const ratios = Object.values(mediaAspectRatiosRef.current);
		if (!ratios.length) {
			setCarouselAspectRatio(DEFAULT_CAROUSEL_ASPECT_RATIO);
			return;
		}
		const tallestRatio = Math.min(...ratios);
		const nextRatio = tallestRatio < DEFAULT_CAROUSEL_ASPECT_RATIO ? tallestRatio : DEFAULT_CAROUSEL_ASPECT_RATIO;
		setCarouselAspectRatio((prev) => (Math.abs(prev - nextRatio) < 0.0001 ? prev : nextRatio));
	}, []);

	const registerMediaAspectRatio = useCallback(
		(idx: number, width: number, height: number) => {
			if (!width || !height || !isFinite(width) || !isFinite(height)) return;
			const ratio = width / height;
			if (!isFinite(ratio) || ratio <= 0) return;
			if (mediaAspectRatiosRef.current[idx] === ratio) return;
			mediaAspectRatiosRef.current[idx] = ratio;
			recomputeCarouselAspectRatio();
		},
		[recomputeCarouselAspectRatio]
	);

	const proofSignature = steps.map((step) => `${step.id ?? "?"}:${step.proof_url ?? ""}`).join("|");

	useEffect(() => {
		mediaAspectRatiosRef.current = {};
		setCarouselAspectRatio(DEFAULT_CAROUSEL_ASPECT_RATIO);
	}, [proofSignature]);

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
		<div className="relative w-full max-w-md sm:max-w-lg md:max-w-xl mx-auto">
			{/* Embla viewport */}
			<div className="overflow-hidden" ref={emblaRef}>
				<div className="flex">
					{steps.map((s, idx) => {
						const proofIsVideo = isVideoUrl(s.proof_url);
						const isMuted = muteMap[idx] ?? true;
						const indicatorState = proofIsVideo ? indicatorMap[idx] ?? (isMuted ? "muted" : null) : null;
						const completedAtLabel = formatDate(s.completed_at);

						return (
							<div key={`slide-${s.id ?? idx}`} className="flex-[0_0_100%] px-1 sm:px-2">
								<div className="bg-neutral-950/80 border border-neutral-800/90 rounded-3xl px-4 sm:px-5 pt-2.5 pb-2 shadow-[0_0_18px_rgba(0,0,0,0.8)]">
									<div className="min-h-[4.25rem] flex flex-col gap-1 pb-1.5">
										<div className="flex flex-wrap items-center justify-between gap-y-0.5 text-[10px] uppercase tracking-[0.25em] text-neutral-500">
											<span>LEVEL {s.level_number ?? "?"}</span>
											<div className="flex flex-wrap items-center gap-2 text-[10px] font-mono tracking-[0.08em] text-neutral-400">
												<span className="text-neutral-200">{formatStatus(s).toUpperCase()}</span>
												{completedAtLabel && (
													<span className="flex items-center gap-1 text-neutral-500 tracking-normal">
														<span className="text-neutral-700">•</span>
														<span>{completedAtLabel}</span>
													</span>
												)}
											</div>
										</div>

										<h2 className="text-xl sm:text-[1.5rem] text-neutral-50 leading-snug">
											{s.title ?? "Untitled challenge"}
										</h2>

										<p className="text-[12px] sm:text-sm text-neutral-400 font-mono leading-snug min-h-[1.8rem]">
											{s.description ?? ""}
										</p>
									</div>

									<div
										className="relative mt-1 mb-3 -mx-4 sm:-mx-5 overflow-hidden flex items-center justify-center"
										style={{ aspectRatio: carouselAspectRatio }}
									>
										{s.proof_url ? (
											proofIsVideo ? (
												<video
													ref={(el) => {
														videoRefs.current[idx] = el;
													}}
													src={s.proof_url}
													className="w-full h-auto shrink-0 select-none"
													autoPlay={autoPlayActive && idx === selectedIndex}
													playsInline
													muted={isMuted}
													preload="auto"
													loop
													draggable={false}
													onLoadedData={(event) => {
														ensureVideoPlaying(idx);
														const el = event.currentTarget;
														registerMediaAspectRatio(
															idx,
															el.videoWidth || el.clientWidth || el.offsetWidth || 1,
															el.videoHeight || el.clientHeight || el.offsetHeight || 1
														);
													}}
													onContextMenu={(e) => e.preventDefault()}
													style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
													onClick={() => handleVideoClick(idx)}
													onPointerDown={() => handlePointerDown(idx)}
													onPointerUp={() => handlePointerRelease(idx)}
													onPointerLeave={() => handlePointerRelease(idx)}
													onPointerCancel={() => handlePointerRelease(idx)}
												/>
											) : (
												<img
													src={s.proof_url}
													className="block w-full h-auto shrink-0 select-none"
													onLoad={(event) => {
														const el = event.currentTarget;
														registerMediaAspectRatio(idx, el.naturalWidth || el.width, el.naturalHeight || el.height || 1);
													}}
												/>
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

										{onSetCover && s.proof_url && (
											<button
												type="button"
												onClick={() => onSetCover(s.id)}
												className={
													"absolute top-2 left-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] transition-all " +
													(coverStepId === s.id
														? "bg-cyan-500/20 border-cyan-200 text-cyan-100 shadow-[0_0_12px_rgba(0,255,255,0.6)]"
														: "bg-black/65 border-neutral-600 text-neutral-200 hover:border-neutral-200")
												}
											>
												{coverStepId === s.id ? "Cover photo" : "Set cover photo"}
											</button>
										)}
									</div>

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

			{/* Bottom row: absolutely centered dots */}
			<div className="mt-0.5 relative h-4">
				{steps.length > 1 && (
					<div className="absolute left-1/2 bottom-0 -translate-x-1/2 flex items-center gap-2">
						{steps.map((step, idx) => (
							<button
								key={`dot-${step.id ?? idx}`}
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
