// src/pages/FeedPage.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import RunCarousel from "../components/RunCarousel";
import type { StepItem } from "../components/RunCarousel";
import LoadingScreen from "../components/LoadingScreen";
import CommentsSheet from "../components/CommentsSheet";

const API_BASE = import.meta.env.VITE_API_BASE as string;

interface RunFeedItem {
	run_id: string;
	user_id: string;
	username: string;
	caption: string | null;
	public: boolean;
	cover_step_id?: number | null;
	like_count: number;
	liked_by_viewer: boolean;
	comment_count: number;
	steps: StepItem[];
}

const CARD_CONTENT_WIDTH_CLASS = "w-full max-w-md sm:max-w-lg md:max-w-xl mx-auto";
const CARD_CONTENT_GUTTER_CLASS = "px-1 sm:px-2";

// How many runs to show immediately when the page loads
const INITIAL_BATCH = 3;

// After that, we load EXACTLY 1 run at a time as the user scrolls
const INCREMENT_BATCH = 3;

export default function FeedPage() {
	const [items, setItems] = useState<RunFeedItem[]>([]);
	const [loadingInitial, setLoadingInitial] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [offset, setOffset] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const [viewerId, setViewerId] = useState<string | null>(null);
	const [activeCommentsRunId, setActiveCommentsRunId] = useState<string | null>(null);

	// Track which card is currently visible
	const [visibleIndex, setVisibleIndex] = useState(0);
	const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
	const initialLoadRef = useRef(false);

	useEffect(() => {
		if (viewerId !== null) return;
		if (typeof window === "undefined") return;

		let existing = window.localStorage.getItem("user_id");
		if (!existing) {
			const generated = window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).slice(2);
			window.localStorage.setItem("user_id", generated);
			existing = generated;
		}
		setViewerId(existing);
	}, [viewerId]);

	// ------------------------------------------------
	// Core loader: fetch `count` more runs from backend
	// ------------------------------------------------
	const loadMore = useCallback(
		async (count: number) => {
			if (loadingMore || !hasMore) return;
			if (!viewerId) return;

			setLoadingMore(true);
			try {
				const params = new URLSearchParams({
					limit: String(count),
					offset: String(offset),
					viewer_id: viewerId,
				});

				const res = await fetch(`${API_BASE}/public-runs?${params.toString()}`);
				if (!res.ok) throw new Error("Failed to load feed");

				const json = await res.json();
				const rawItems: RunFeedItem[] = json.items || [];
				const normalized = rawItems.map((item) => ({
					...item,
					like_count: item.like_count ?? 0,
					liked_by_viewer: item.liked_by_viewer ?? false,
					comment_count: item.comment_count ?? 0,
				}));

				setItems((prev) => {
					const seen = new Set(prev.map((item) => item.run_id));
					const deduped = normalized.filter((item) => !seen.has(item.run_id));
					return [...prev, ...deduped];
				});

				// Advance offset by however many we actually received
				const received = normalized.length;
				const nextOffsetFromBackend = typeof json.next_offset === "number" ? json.next_offset : null;
				setOffset((prevOffset) => nextOffsetFromBackend ?? prevOffset + received);

				// Backend tells us if there might be more
				const backendHasMore = json.has_more ?? received === count;
				if (!backendHasMore || received === 0) {
					setHasMore(false);
				}
			} catch (err) {
				console.error(err);
			} finally {
				setLoadingMore(false);
				setLoadingInitial(false);
			}
		},
		[hasMore, loadingMore, offset, viewerId]
	);

	// -------------------------------
	// Initial load: one batch
	// -------------------------------
	useEffect(() => {
		if (!viewerId) return;
		if (initialLoadRef.current) return;
		initialLoadRef.current = true;
		loadMore(INITIAL_BATCH);
	}, [viewerId, loadMore]);

	// ------------------------------------------------
	// Track which feed item is visible (by index)
	// ------------------------------------------------
	useEffect(() => {
		if (items.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				let mostVisible: IntersectionObserverEntry | null = null;

				entries.forEach((entry) => {
					if (!entry.isIntersecting) return;
					if (!mostVisible || entry.intersectionRatio > mostVisible.intersectionRatio) {
						mostVisible = entry;
					}
				});

				if (!mostVisible) return;

				const idxAttr = mostVisible.target.getAttribute("data-index");
				if (!idxAttr) return;

				const idx = Number(idxAttr);
				if (!Number.isNaN(idx)) {
					setVisibleIndex(idx);
				}
			},
			{
				threshold: 0.6, // 60% of the card must be visible to count as "current"
			}
		);

		itemRefs.current.forEach((el) => el && observer.observe(el));

		return () => observer.disconnect();
	}, [items]);

	// ------------------------------------------------
	// Scroll-driven loading:
	// Desired total = INITIAL_BATCH + visibleIndex
	// i.e. scroll down by 1 card -> 1 more run fetched
	// ------------------------------------------------
	useEffect(() => {
		if (!hasMore || loadingMore) return;
		if (items.length === 0) return;

		const desiredTotal = INITIAL_BATCH + visibleIndex;

		if (items.length < desiredTotal) {
			// We only ever fetch 1 at a time in this phase
			loadMore(INCREMENT_BATCH);
		}
	}, [visibleIndex, items.length, hasMore, loadingMore, loadMore]);

	function handleLike(run_id: string) {
		if (!viewerId) return;

		const target = items.find((run) => run.run_id === run_id);
		if (!target) return;

		const nextLiked = !target.liked_by_viewer;
		const delta = nextLiked ? 1 : -1;

		setItems((prev) =>
			prev.map((run) =>
				run.run_id === run_id
					? { ...run, liked_by_viewer: nextLiked, like_count: Math.max(0, run.like_count + delta) }
					: run
			)
		);

		(async () => {
			try {
				const res = await fetch(`${API_BASE}/runs/${run_id}/like`, {
					method: nextLiked ? "POST" : "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ user_id: viewerId }),
				});

				if (!res.ok) throw new Error("Failed to toggle like");
				const json = await res.json();

				setItems((prev) =>
					prev.map((run) =>
						run.run_id === run_id
							? {
									...run,
									like_count: typeof json.like_count === "number" ? json.like_count : run.like_count,
									liked_by_viewer: typeof json.liked === "boolean" ? json.liked : run.liked_by_viewer,
							  }
							: run
					)
				);
			} catch (err) {
				console.error(err);
				setItems((prev) =>
					prev.map((run) =>
						run.run_id === run_id
							? {
									...run,
									liked_by_viewer: !nextLiked,
									like_count: Math.max(0, run.like_count - delta),
							  }
							: run
					)
				);
			}
		})();
	}

	function handleComment(run_id: string) {
		setActiveCommentsRunId(run_id);
	}

	function formatCount(count: number) {
		if (count < 1000) return count.toString();
		const value = count / 1000;
		if (value < 10) {
			const rounded = Math.round(value * 10) / 10;
			return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
		}
		return `${Math.round(value)}k`;
	}

	const handleCommentAdded = useCallback((runId: string) => {
		setItems((prev) =>
			prev.map((run) =>
				run.run_id === runId ? { ...run, comment_count: Math.max(0, (run.comment_count ?? 0) + 1) } : run
			)
		);
	}, []);

	const activeRun = activeCommentsRunId ? items.find((run) => run.run_id === activeCommentsRunId) : null;

	// -------------------------------
	// Render
	// -------------------------------
	if (loadingInitial && items.length === 0) {
		return <LoadingScreen />;
	}

	return (
		<>
			<div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-black via-neutral-950 to-black text-neutral-100 font-['VT323']">
				<div
					className="pointer-events-none fixed inset-0 opacity-30 z-0"
					style={{
						backgroundImage:
							"radial-gradient(circle at 20% 20%, rgba(0,255,255,0.2), transparent 55%), radial-gradient(circle at 85% 10%, rgba(255,0,153,0.18), transparent 50%)",
					}}
				/>
				<div
					className="pointer-events-none fixed inset-0 opacity-[0.08] z-0"
					style={{
						backgroundImage:
							"linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
						backgroundSize: "80px 80px",
					}}
				/>

				{/* FIXED HEADER */}
				<div
					className="
			fixed top-0 left-0 w-full
			h-14 flex items-center justify-center 
			bg-black/90 backdrop-blur-sm
			border-b border-neutral-800 
			z-50
		"
				>
					<h1 className="text-3xl tracking-[0.3em] drop-shadow-[0_0_12px_rgba(255,255,255,0.35)] pointer-events-none">
						DO STUFF
					</h1>

					<button
						onClick={() => (window.location.href = "/")}
						className="
					group absolute right-5 p-1 text-neutral-100 transition-all duration-200 hover:text-amber-200 hover:drop-shadow-[0_0_18px_rgba(255,210,120,0.55)]
					drop-shadow-[0_0_12px_rgba(0,0,0,0.8)]
				"
						aria-label="Back to home"
					>
						<svg viewBox="0 0 20 20" className="w-7 h-7 plus-animated" fill="none" stroke="currentColor" strokeWidth="2">
							<defs>
								<linearGradient id="plusSwirl" x1="0" y1="0" x2="20" y2="0" gradientUnits="userSpaceOnUse">
									<stop offset="0%" stopColor="#fffbe1">
										<animate
											attributeName="stop-color"
											values="#fffbe1;#fff2c7;#fffbe1"
											dur="8s"
											repeatCount="indefinite"
										/>
									</stop>
									<stop offset="35%" stopColor="#ffe58a" stopOpacity="0.85">
										<animate attributeName="offset" values="0.24;0.4;0.3" dur="8s" repeatCount="indefinite" />
										<animate
											attributeName="stop-color"
											values="#ffe58a;#ffd05b;#ffe58a"
											dur="8s"
											repeatCount="indefinite"
										/>
									</stop>
									<stop offset="70%" stopColor="#ffce54" stopOpacity="0.78">
										<animate attributeName="offset" values="0.6;0.78;0.64" dur="8s" repeatCount="indefinite" />
										<animate
											attributeName="stop-color"
											values="#ffce54;#ffe08a;#ffce54"
											dur="8s"
											repeatCount="indefinite"
										/>
									</stop>
									<stop offset="100%" stopColor="#fff8da">
										<animate
											attributeName="stop-color"
											values="#fff8da;#ffeab6;#fff8da"
											dur="8s"
											repeatCount="indefinite"
										/>
									</stop>
									<animateTransform
										attributeName="gradientTransform"
										type="translate"
										values="-26 0;-26 0;22 0;22 0;-26 0"
										keyTimes="0;0.3;0.5;0.8;1"
										dur="8s"
										repeatCount="indefinite"
									/>
									<animateTransform
										attributeName="gradientTransform"
										additive="sum"
										type="skewX"
										values="0;7;-5;4;0"
										keyTimes="0;0.35;0.55;0.82;1"
										dur="8s"
										repeatCount="indefinite"
									/>
								</linearGradient>
							</defs>
							<path d="M10 3v14" strokeLinecap="round" stroke="url(#plusSwirl)" />
							<path d="M3 10h14" strokeLinecap="round" stroke="url(#plusSwirl)" />
						</svg>
					</button>
				</div>

				{/* CONTENT BELOW FIXED HEADER */}
				<div className="relative z-10 pt-16 pb-6 flex flex-col w-full">
					<div className="w-full flex flex-col gap-0 pb-10">
						{items.map((run, index) => {
							const coverIndex = run.steps.findIndex((step) => step.is_cover);
							const initialCarouselIndex = coverIndex >= 0 ? coverIndex : 0;

							return (
								<article
									key={run.run_id}
									data-index={index}
									ref={(el: HTMLDivElement | null) => {
										itemRefs.current[index] = el;
									}}
									className="w-full px-3 sm:px-4 py-3"
								>
									<div
										className={`${CARD_CONTENT_WIDTH_CLASS} ${CARD_CONTENT_GUTTER_CLASS} mx-auto rounded-3xl bg-black/55 border border-neutral-800/60 backdrop-blur-md shadow-[0_0_30px_rgba(0,0,0,0.32)] overflow-hidden`}
									>
										<div className="flex items-center justify-between mb-2 px-2 pt-2">
											<div className="flex items-center gap-1.5">
												<div className="w-7 h-7 rounded-full border border-neutral-700 bg-neutral-900/80 flex items-center justify-center text-xs">
													{run.username.slice(0, 2).toUpperCase()}
												</div>
												<div className="text-sm sm:text-base tracking-wide">{run.username}</div>
											</div>

											{run.public && (
												<span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">PUBLIC</span>
											)}
										</div>

										<div className="w-full">
											<RunCarousel
												steps={run.steps}
												autoPlayActive={index === visibleIndex}
												initialIndex={initialCarouselIndex}
											/>

											<div className="mt-0 flex flex-col gap-1.5 text-sm text-neutral-300 pb-4 px-2">
												<div className="flex flex-wrap items-center gap-3">
													<div className="flex items-center gap-1.5">
														<button
															type="button"
															onClick={() => handleLike(run.run_id)}
															aria-pressed={run.liked_by_viewer}
															aria-label={run.liked_by_viewer ? "Unlike run" : "Like run"}
															className={
																"flex items-center justify-center transition-colors " +
																(run.liked_by_viewer ? "text-cyan-300" : "text-neutral-400 hover:text-cyan-300")
															}
														>
															<svg
																viewBox="0 0 20 20"
																className="w-6 h-6"
																fill={run.liked_by_viewer ? "currentColor" : "none"}
																stroke="currentColor"
																strokeWidth="1.6"
															>
																<path d="M10 16.5s-4.2-2.7-6.2-4.8C2.3 10.1 2 7.9 3.5 6.4c1.1-1.1 3.1-0.9 4.1 0.1L10 8.9l2.4-2.4c1-1 3-1.2 4.1-0.1 1.5 1.5 1.2 3.7-0.3 5.3-2 2.1-6.2 4.8-6.2 4.8z" />
															</svg>
														</button>
														{run.like_count > 0 && (
															<span className="text-xs font-mono text-neutral-400">{formatCount(run.like_count)}</span>
														)}
													</div>

													<div className="flex items-center gap-1.5">
														<button
															type="button"
															onClick={() => handleComment(run.run_id)}
															className="text-neutral-400 hover:text-cyan-300 transition-colors"
															aria-label="Comment"
														>
															<svg
																viewBox="0 0 20 20"
																className="w-6 h-6"
																fill="none"
																stroke="currentColor"
																strokeWidth="1.5"
															>
																<path d="M4 6h12v7H9.5L6 17v-4H4z" strokeLinejoin="round" />
															</svg>
														</button>
														{run.comment_count > 0 && (
															<span className="text-xs font-mono text-neutral-500">
																{formatCount(run.comment_count)}
															</span>
														)}
													</div>
												</div>

												{run.caption && (
													<div className="border-t border-neutral-800/60 pt-1.5 text-xs text-neutral-200 font-mono">
														<p className="break-words whitespace-pre-line leading-snug">
															<span className="font-bold text-neutral-50">{run.username}</span> {run.caption}
														</p>
													</div>
												)}
											</div>
										</div>
									</div>
								</article>
							);
						})}

						{/* Status row */}
						<div className="h-16 flex items-center justify-center text-neutral-500 text-xs font-mono">
							{loadingMore ? (
								<p className="animate-[flicker_1.4s_steps(2)_infinite] tracking-widest text-neutral-300 font-['VT323'] text-2xl">
									LOADING...
								</p>
							) : hasMore ? (
								"Scroll to see more runs"
							) : (
								"No more runs"
							)}
						</div>
					</div>
				</div>
			</div>

			{activeRun && (
				<CommentsSheet
					runId={activeRun.run_id}
					runOwner={activeRun.username}
					open={Boolean(activeCommentsRunId)}
					onClose={() => setActiveCommentsRunId(null)}
					viewerId={viewerId}
					onNewComment={handleCommentAdded}
				/>
			)}
		</>
	);
}
