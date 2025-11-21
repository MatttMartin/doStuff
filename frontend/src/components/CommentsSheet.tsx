import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";

const API_BASE = import.meta.env.VITE_API_BASE as string;

export interface CommentItem {
	id: number;
	run_id: string;
	user_id: string;
	username: string;
	content: string;
	created_at: string | null;
}

interface CommentsSheetProps {
	runId: string;
	runOwner: string;
	open: boolean;
	onClose: () => void;
	viewerId: string | null;
	onNewComment?: (runId: string) => void;
}

function formatTimeAgo(iso: string | null): string {
	if (!iso) return "";
	const ts = new Date(iso).getTime();
	if (Number.isNaN(ts)) return "";

	const diffSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
	if (diffSeconds < 45) return "now";
	if (diffSeconds < 90) return "1m";
	if (diffSeconds < 3600) return `${Math.max(1, Math.floor(diffSeconds / 60))}m`;
	if (diffSeconds < 5400) return "1h";
	if (diffSeconds < 86400) return `${Math.max(1, Math.floor(diffSeconds / 3600))}h`;
	return `${Math.max(1, Math.floor(diffSeconds / 86400))}d`;
}

export default function CommentsSheet({ runId, runOwner, open, onClose, viewerId, onNewComment }: CommentsSheetProps) {
	const [comments, setComments] = useState<CommentItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [input, setInput] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [dragOffset, setDragOffset] = useState(0);
	const [isMounted, setIsMounted] = useState(open);
	const [visible, setVisible] = useState(open);
	const dragStartRef = useRef<number | null>(null);
	const draggingRef = useRef(false);
	const sheetRef = useRef<HTMLDivElement | null>(null);

	// Manage mount + play transitions on open/close
	useEffect(() => {
		if (open) {
			setIsMounted(true);
			// Start next tick so CSS transition runs
			const id = requestAnimationFrame(() => setVisible(true));
			return () => cancelAnimationFrame(id);
		}
		setVisible(false);
		const timeout = window.setTimeout(() => setIsMounted(false), 400);
		return () => window.clearTimeout(timeout);
	}, [open]);

	useEffect(() => {
		const original = document.body.style.overflow;
		if (open) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = original;
		}
		return () => {
			document.body.style.overflow = original;
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		setLoading(true);
		let cancelled = false;

		async function load() {
			try {
				const res = await fetch(`${API_BASE}/runs/${runId}/comments?limit=200`);
				const json = await res.json();
				if (!cancelled) {
					setComments(json.items ?? []);
				}
			} catch (err) {
				console.error("Failed to load comments", err);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [open, runId]);

	useEffect(() => {
		if (!open) return;
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	useEffect(() => {
		// Reset state when switching runs
		setComments([]);
		setInput("");
	}, [runId]);

	const handleOutside = useCallback(
		(event: PointerEvent<HTMLDivElement> | MouseEvent) => {
			if (!sheetRef.current) return;
			if (sheetRef.current.contains(event.target as Node)) return;
			onClose();
		},
		[onClose]
	);

	const handleSubmit = useCallback(
		async (event?: FormEvent) => {
			if (event) event.preventDefault();
			const trimmed = input.trim();
			if (!trimmed || !viewerId) return;

			setSubmitting(true);
			try {
				const res = await fetch(`${API_BASE}/runs/${runId}/comments`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ user_id: viewerId, content: trimmed }),
				});

				if (!res.ok) throw new Error("Failed to post comment");
				const json = await res.json();
				setComments((prev) => [...prev, json as CommentItem]);
				setInput("");
				if (onNewComment) onNewComment(runId);
			} catch (err) {
				console.error(err);
			} finally {
				setSubmitting(false);
			}
		},
		[input, onNewComment, runId, viewerId]
	);

	const startDrag = useCallback((clientY: number) => {
		draggingRef.current = true;
		dragStartRef.current = clientY;
	}, []);

	const updateDrag = useCallback((clientY: number) => {
		if (!draggingRef.current || dragStartRef.current === null) return;
		const delta = Math.max(0, clientY - dragStartRef.current);
		setDragOffset(delta);
	}, []);

	const endDrag = useCallback(() => {
		if (!draggingRef.current) return;
		draggingRef.current = false;
		const shouldClose = dragOffset > 90;
		setDragOffset(0);
		if (shouldClose) {
			onClose();
		}
	}, [dragOffset, onClose]);

	const handlePointerDown = useCallback(
		(event: PointerEvent) => {
			const target = event.target as HTMLElement;
			if (target?.closest("button,textarea,input")) return;
			startDrag(event.clientY);
		},
		[startDrag]
	);

	const handlePointerMove = useCallback((event: PointerEvent) => {
		updateDrag(event.clientY);
	}, [updateDrag]);

	const handlePointerEnd = useCallback(() => {
		endDrag();
	}, [endDrag]);

	const hasComments = comments.length > 0;

	const sheetStyle = useMemo(() => {
		const baseTransition = "transform 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease";
		const shouldAnimate = !draggingRef.current;
		return {
			transform: visible ? `translateY(${dragOffset}px)` : "translateY(110%)",
			opacity: visible ? 1 : 0,
			transition: shouldAnimate ? baseTransition : "none",
			willChange: shouldAnimate ? "transform, opacity" : undefined,
		};
	}, [dragOffset, visible]);

	if (!isMounted) return null;

	return (
		<div
			className="fixed inset-0 z-[60]"
			style={{ pointerEvents: isMounted ? "auto" : "none" }}
			onPointerDownCapture={handleOutside}
			onClick={handleOutside}
		>
			<div
				onClick={onClose}
				className={
					"absolute inset-0 bg-black/70 backdrop-blur-[2px] transition-opacity duration-200 " +
					(visible ? "opacity-100" : "opacity-0")
				}
			/>

			<div className="fixed left-0 right-0 bottom-0" style={sheetStyle}>
				<div className="mx-auto max-w-3xl w-full px-4 pb-5 pt-2">
					<div
						className="mx-auto mt-2 mb-3 h-1.5 w-16 rounded-full bg-neutral-700/90"
						style={{ touchAction: "none" }}
						onPointerDown={handlePointerDown}
						onPointerMove={handlePointerMove}
						onPointerUp={handlePointerEnd}
						onPointerCancel={handlePointerEnd}
						onPointerLeave={handlePointerEnd}
					/>

					<div
						ref={sheetRef}
						className="rounded-3xl border border-neutral-800 bg-gradient-to-b from-neutral-900 via-black to-neutral-950 shadow-[0_0_22px_rgba(0,0,0,0.65)] h-[60vh] max-h-[70vh] min-h-[50vh] flex flex-col overflow-hidden"
					>
						<div
							className="flex items-center justify-between px-5 pt-3 pb-2 select-none"
							style={{ touchAction: "none" }}
							onPointerDown={handlePointerDown}
							onPointerMove={handlePointerMove}
							onPointerUp={handlePointerEnd}
							onPointerCancel={handlePointerEnd}
							onPointerLeave={handlePointerEnd}
						>
							<div>
								<p className="text-[10px] uppercase tracking-[0.28em] text-neutral-500">Comments</p>
								<p className="text-lg text-neutral-100">{runOwner}</p>
							</div>
							<button
								type="button"
								onClick={onClose}
								className="p-2 text-neutral-400 hover:text-neutral-200 transition-colors"
								aria-label="Close comments"
							>
								<svg viewBox="0 0 20 20" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.6">
									<path d="M5 5l10 10" />
									<path d="M15 5L5 15" />
								</svg>
							</button>
						</div>

						<div className="px-5 pb-3 flex-1 flex flex-col min-h-0">
							<div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-3 scrollbar-hide">
								{loading && (
									<div className="py-6 flex items-center justify-center">
										<p className="animate-[flicker_1.4s_steps(2)_infinite] tracking-widest text-neutral-300 font-['VT323'] text-2xl">
											LOADING…
										</p>
									</div>
								)}

								{!loading && !hasComments && (
									<div className="py-6 text-center text-sm text-neutral-500 font-mono tracking-[0.1em]">
										Be the first to comment.
									</div>
								)}

								{comments.map((comment) => (
									<div key={comment.id} className="rounded-2xl border border-neutral-800 bg-black/40 p-3">
										<div className="flex items-center justify-between gap-3">
											<div className="flex items-center gap-2">
												<div className="w-8 h-8 rounded-full border border-neutral-700 bg-neutral-900 flex items-center justify-center text-xs">
													{comment.username.slice(0, 2).toUpperCase()}
												</div>
												<div>
													<p className="text-sm text-neutral-100 leading-tight">{comment.username}</p>
													<p className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
														{formatTimeAgo(comment.created_at)}
													</p>
												</div>
											</div>
										</div>
										<p className="mt-2 text-[15px] leading-snug text-neutral-100 whitespace-pre-wrap break-words">
											{comment.content}
										</p>
									</div>
								))}
							</div>

							<form className="mt-3 flex items-stretch gap-2" onSubmit={handleSubmit}>
								<div className="flex-1">
									<textarea
										value={input}
										onChange={(e) => setInput(e.target.value)}
										placeholder={viewerId ? "Add a comment..." : "Loading user..."}
										className="w-full h-12 rounded-2xl bg-neutral-900/70 border border-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-cyan-300 focus:ring-1 focus:ring-cyan-400 transition-all resize-none"
										rows={1}
										disabled={!viewerId || submitting}
									/>
								</div>
								<button
									type="submit"
									disabled={!viewerId || submitting || input.trim().length === 0}
									className={
										"h-12 min-w-[64px] rounded-xl px-3.5 text-sm font-mono uppercase tracking-[0.2em] transition-all flex items-center justify-center border " +
										(!viewerId || submitting || input.trim().length === 0
											? " bg-neutral-800 text-neutral-500 border-neutral-800 cursor-not-allowed"
											: " bg-cyan-700/30 text-cyan-200 border-cyan-400/60 hover:bg-cyan-600/40")
									}
								>
									Send
								</button>
							</form>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
