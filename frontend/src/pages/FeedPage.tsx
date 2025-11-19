// src/pages/FeedPage.tsx
import { useEffect, useState, useRef, useCallback } from "react";
import RunCarousel from "../components/RunCarousel";
import type { StepItem } from "../components/RunCarousel";

const API_BASE = import.meta.env.VITE_API_BASE as string;

interface RunFeedItem {
	run_id: string;
	user_id: string;
	username: string;
	caption: string | null;
	public: boolean;
	cover_step_id?: number | null;
	steps: StepItem[];
}

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

	// Track which card is currently visible
	const [visibleIndex, setVisibleIndex] = useState(0);
	const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

	// ------------------------------------------------
	// Core loader: fetch `count` more runs from backend
	// ------------------------------------------------
	const loadMore = useCallback(
		async (count: number) => {
			if (loadingMore || !hasMore) return;

			setLoadingMore(true);
			try {
				const res = await fetch(`${API_BASE}/public-runs?limit=${count}&offset=${offset}`);
				if (!res.ok) throw new Error("Failed to load feed");

				const json = await res.json();
				const newItems: RunFeedItem[] = json.items || [];

				setItems((prev) => {
					const seen = new Set(prev.map((item) => item.run_id));
					const deduped = newItems.filter((item) => !seen.has(item.run_id));
					return [...prev, ...deduped];
				});

				// Advance offset by however many we actually received
				const received = newItems.length;
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
		[hasMore, loadingMore, offset]
	);

	// -------------------------------
	// Initial load: one batch
	// -------------------------------
	useEffect(() => {
		// Load INITIAL_BATCH items once on mount
		loadMore(INITIAL_BATCH);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// ------------------------------------------------
	// Track which feed item is visible (by index)
	// ------------------------------------------------
	useEffect(() => {
		if (items.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						const idxAttr = entry.target.getAttribute("data-index");
						if (!idxAttr) return;

						const idx = Number(idxAttr);
						if (!Number.isNaN(idx)) {
							setVisibleIndex(idx);
						}
					}
				});
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
		console.log("Like run", run_id);
	}

	function handleComment(run_id: string) {
		console.log("Comment on run", run_id);
	}

	// -------------------------------
	// Render
	// -------------------------------
	if (loadingInitial && items.length === 0) {
		return (
			<div className="min-h-screen flex items-center justify-center text-neutral-300 font-['VT323'] text-4xl">
				<p className="animate-[flicker_1.4s_steps(2)_infinite] tracking-widest">LOADING…</p>
			</div>
		);
	}

	return (
		<div className="min-h-screen w-full bg-black text-neutral-100 font-['VT323'] relative">
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
					absolute right-5 p-1
					text-neutral-200 hover:text-cyan-200 transition-colors
					drop-shadow-[0_0_12px_rgba(0,0,0,0.8)]
				"
					aria-label="Back to home"
				>
					<svg viewBox="0 0 20 20" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M10 3v14" strokeLinecap="round" />
						<path d="M3 10h14" strokeLinecap="round" />
					</svg>
				</button>
			</div>

			{/* CONTENT BELOW FIXED HEADER */}
			<div className="pt-20 px-4 pb-6 flex flex-col items-center w-full">
				<div className="w-full max-w-4xl flex flex-col gap-8 pb-10">
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
								className="border border-neutral-800 rounded-3xl bg-neutral-950/80 shadow-[0_0_18px_rgba(0,0,0,0.85)] px-3 sm:px-4 py-4"
							>
								{/* Header */}
								<div className="flex items-center justify-between mb-3">
									<div className="flex items-center gap-2">
										<div className="w-7 h-7 rounded-full border border-neutral-700 bg-neutral-900 flex items-center justify-center text-xs">
											{run.username.slice(0, 2).toUpperCase()}
										</div>
										<div className="text-sm sm:text-base tracking-wide">{run.username}</div>
									</div>

									{run.public && <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">PUBLIC</span>}
								</div>

								<RunCarousel steps={run.steps} autoPlayActive={index === visibleIndex} initialIndex={initialCarouselIndex} />

								{run.caption && (
									<p className="mt-3 text-[13px] sm:text-sm text-neutral-300 font-mono">
										<span className="font-bold mr-1">{run.username}</span>
										{run.caption}
									</p>
								)}

								{/* Like / Comment */}
								<div className="mt-3 flex items-center gap-4 text-sm">
									<button
										type="button"
										onClick={() => handleLike(run.run_id)}
										className="flex items-center gap-1 text-neutral-300 hover:text-cyan-300 transition-colors"
									>
										<svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.2">
											<path d="M8 13s-3.5-2.3-5.2-4.1C1.4 7.3 1 5.4 2.2 4.2 3.2 3.2 4.8 3.4 5.7 4.3L8 6.5l2.3-2.2c0.9-0.9 2.5-1.1 3.5 0 1.2 1.2 0.8 3.1-0.6 4.7C11.5 10.7 8 13 8 13z" />
										</svg>
										<span>Like</span>
									</button>

									<button
										type="button"
										onClick={() => handleComment(run.run_id)}
										className="flex items-center gap-1 text-neutral-300 hover:text-cyan-300 transition-colors"
									>
										<svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.2">
											<path d="M2.5 3.5h11v6h-6.5L4 12.5v-3H2.5z" />
										</svg>
										<span>Comment</span>
									</button>
								</div>
							</article>
						);
					})}

					{/* Status row */}
					<div className="h-16 flex items-center justify-center text-neutral-500 text-xs font-mono">
						{loadingMore ? (
							<p className="animate-[flicker_1.4s_steps(2)_infinite] tracking-widest text-neutral-300 font-['VT323'] text-2xl">
								LOADING…
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
	);
}
