import { useEffect, useMemo, useState } from "react";
import { getLevels, createRun, addStep, uploadProof, getRunsForUser, getRunDetail } from "./lib/api";

import type { RunSummary, RunDetail } from "./lib/api";

const DEMO_USER_ID = "dd2bc338-d974-4f5c-b8e8-25ba7a6ed95c"; // from SQL insert

type Level = {
	id: number;
	title: string;
	description: string | null;
	category: string | null;
	difficulty: number | null;
	seconds_limit: number | null;
};

type Tab = "play" | "runs";

export default function App() {
	const [levels, setLevels] = useState<Level[]>([]);
	const [loading, setLoading] = useState(true);
	const [err, setErr] = useState<string | null>(null);

	const [runId, setRunId] = useState<string | null>(null);
	const [status, setStatus] = useState<string>("");

	const [busyLevelId, setBusyLevelId] = useState<number | null>(null);
	const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
	const [fileByLevel, setFileByLevel] = useState<Record<number, File | null>>({});

	// runs tab state
	const [tab, setTab] = useState<Tab>("play");
	const [runs, setRuns] = useState<RunSummary[]>([]);
	const [runsLoading, setRunsLoading] = useState(false);
	const [runsErr, setRunsErr] = useState<string | null>(null);
	const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
	const [selectedRunLoading, setSelectedRunLoading] = useState(false);

	useEffect(() => {
		getLevels()
			.then(setLevels)
			.catch((e) => {
				console.error(e);
				setErr(e.message ?? String(e));
			})
			.finally(() => setLoading(false));
	}, []);

	const apiBase = useMemo(() => (import.meta.env.VITE_API_BASE as string | undefined) || "", []);

	async function startRun() {
		try {
			setStatus("Starting run…");
			const { id } = await createRun(DEMO_USER_ID, "My first run");
			setRunId(id);
			setStatus(`Run started: ${id}`);
		} catch (e: any) {
			console.error(e);
			setStatus(`Failed to start run: ${e?.message ?? e}`);
		}
	}

	function pickFile(levelId: number, f: File | null) {
		setFileByLevel((prev) => ({ ...prev, [levelId]: f }));
	}

	async function completeWithOptionalPhoto(levelId: number) {
		if (!runId) {
			setStatus("Start a run first.");
			return;
		}
		setBusyLevelId(levelId);
		try {
			let proofUrl: string | undefined;
			const f = fileByLevel[levelId] || null;
			if (f) {
				setStatus(`Uploading photo for level ${levelId}…`);
				const { url } = await uploadProof(f);
				proofUrl = url;
			}
			setStatus(`Saving completion for level ${levelId}…`);
			await addStep(runId, levelId, proofUrl);
			setCompletedIds((prev) => new Set(prev).add(levelId));
			setStatus(`Completed level ${levelId}${proofUrl ? " with photo" : ""}.`);
		} catch (e: any) {
			console.error(e);
			setStatus(`Failed: ${e?.message ?? e}`);
		} finally {
			setBusyLevelId(null);
		}
	}

	async function ensureRunsLoaded() {
		if (runsLoading || runs.length > 0) return;
		setRunsLoading(true);
		setRunsErr(null);
		try {
			const data = await getRunsForUser(DEMO_USER_ID);
			setRuns(data);
		} catch (e: any) {
			console.error(e);
			setRunsErr(e?.message ?? String(e));
		} finally {
			setRunsLoading(false);
		}
	}

	async function selectRun(runId: string) {
		setSelectedRunLoading(true);
		try {
			const detail = await getRunDetail(runId);
			setSelectedRun(detail);
		} catch (e: any) {
			console.error(e);
			setStatus(`Failed to load run: ${e?.message ?? e}`);
		} finally {
			setSelectedRunLoading(false);
		}
	}

	if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
	if (err) return <div style={{ padding: 16, color: "red" }}>Error: {err}</div>;

	return (
		<main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
			<header
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 16,
				}}
			>
				<div>
					<h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Do Stuff</h1>
					<div style={{ fontSize: 12, opacity: 0.7 }}>API: {apiBase}</div>
				</div>

				<div style={{ display: "flex", gap: 8 }}>
					<button
						onClick={() => {
							setTab("play");
						}}
						style={{
							padding: "6px 10px",
							borderRadius: 999,
							border: "1px solid #ccc",
							background: tab === "play" ? "#111" : "#fff",
							color: tab === "play" ? "#fff" : "#111",
							cursor: "pointer",
						}}
					>
						Play
					</button>
					<button
						onClick={() => {
							setTab("runs");
							void ensureRunsLoaded();
						}}
						style={{
							padding: "6px 10px",
							borderRadius: 999,
							border: "1px solid #ccc",
							background: tab === "runs" ? "#111" : "#fff",
							color: tab === "runs" ? "#fff" : "#111",
							cursor: "pointer",
						}}
					>
						My runs
					</button>
				</div>
			</header>

			{status && (
				<div
					style={{
						marginBottom: 16,
						padding: 10,
						border: "1px solid #eee",
						borderRadius: 8,
						background: "#fafafa",
						fontSize: 14,
					}}
				>
					{status}
				</div>
			)}

			{tab === "play" ? (
				<>
					{!runId ? (
						<button
							onClick={startRun}
							style={{
								marginBottom: 16,
								padding: "8px 14px",
								borderRadius: 8,
								border: "1px solid #ccc",
								background: "#111",
								color: "white",
								cursor: "pointer",
							}}
						>
							Start new run
						</button>
					) : (
						<div style={{ marginBottom: 16, fontSize: 12, opacity: 0.8 }}>
							Current run: <code>{runId}</code>
						</div>
					)}

					<h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Levels</h2>
					<ul style={{ display: "grid", gap: 12 }}>
						{levels.map((lvl) => {
							const isCompleted = completedIds.has(lvl.id);
							const isBusy = busyLevelId === lvl.id;

							return (
								<li
									key={lvl.id}
									style={{
										border: "1px solid #ddd",
										borderRadius: 10,
										padding: 12,
										display: "grid",
										gap: 6,
									}}
								>
									<div style={{ fontWeight: 600 }}>{lvl.title}</div>
									{lvl.description && <div style={{ opacity: 0.8, fontSize: 14 }}>{lvl.description}</div>}
									<div style={{ fontSize: 12, opacity: 0.7 }}>
										{lvl.category ?? "uncategorized"} · diff {lvl.difficulty ?? "-"} · limit {lvl.seconds_limit ?? "-"}s
									</div>

									<div
										style={{
											display: "flex",
											gap: 8,
											alignItems: "center",
											flexWrap: "wrap",
										}}
									>
										<input
											type="file"
											accept="image/png,image/jpeg,image/webp"
											onChange={(e) => pickFile(lvl.id, e.target.files?.[0] ?? null)}
										/>
										<button
											onClick={() => completeWithOptionalPhoto(lvl.id)}
											disabled={!runId || isBusy || isCompleted}
											style={{
												padding: "6px 10px",
												borderRadius: 8,
												border: "1px solid #ccc",
												background: isCompleted ? "#e8f7ea" : "#fff",
												color: isCompleted ? "#1a7f37" : "#111",
												cursor: !runId || isBusy || isCompleted ? "not-allowed" : "pointer",
											}}
											title={!runId ? "Start a run first" : undefined}
										>
											{isCompleted ? "Completed ✓" : isBusy ? "Saving…" : "Mark Complete"}
										</button>
									</div>
								</li>
							);
						})}
					</ul>
				</>
			) : (
				<>
					<h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>My runs</h2>

					{runsLoading && <div>Loading runs…</div>}
					{runsErr && <div style={{ color: "red", marginBottom: 8 }}>Error: {runsErr}</div>}

					<div
						style={{
							display: "grid",
							gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 2fr)",
							gap: 16,
						}}
					>
						<ul
							style={{
								border: "1px solid #ddd",
								borderRadius: 8,
								padding: 8,
								maxHeight: 360,
								overflow: "auto",
							}}
						>
							{runs.length === 0 && !runsLoading && (
								<li style={{ fontSize: 14, opacity: 0.7 }}>No runs yet. Start one in the Play tab.</li>
							)}
							{runs.map((r) => (
								<li
									key={r.id}
									onClick={() => selectRun(r.id)}
									style={{
										padding: 8,
										borderRadius: 6,
										cursor: "pointer",
										background: selectedRun?.id === r.id ? "#eef3ff" : "transparent",
									}}
								>
									<div style={{ fontWeight: 600 }}>{r.caption || "Untitled run"}</div>
									<div style={{ fontSize: 12, opacity: 0.7 }}>
										{r.created_at ? new Date(r.created_at).toLocaleString() : "no date"} · {r.steps_completed} step
										{r.steps_completed === 1 ? "" : "s"}
									</div>
								</li>
							))}
						</ul>

						<div
							style={{
								border: "1px solid #ddd",
								borderRadius: 8,
								padding: 10,
								minHeight: 120,
							}}
						>
							{selectedRunLoading && <div>Loading run…</div>}
							{!selectedRun && !selectedRunLoading && (
								<div style={{ fontSize: 14, opacity: 0.7 }}>Select a run on the left to see details.</div>
							)}
							{selectedRun && !selectedRunLoading && (
								<div style={{ display: "grid", gap: 8 }}>
									<div>
										<div style={{ fontWeight: 600 }}>{selectedRun.caption || "Untitled run"}</div>
										<div style={{ fontSize: 12, opacity: 0.7 }}>
											{selectedRun.created_at ? new Date(selectedRun.created_at).toLocaleString() : "no date"}
										</div>
									</div>
									<ul style={{ display: "grid", gap: 6 }}>
										{selectedRun.steps.map((s) => (
											<li
												key={s.id}
												style={{
													fontSize: 14,
													borderBottom: "1px solid #eee",
													paddingBottom: 4,
												}}
											>
												<div style={{ fontWeight: 500 }}>
													{s.level_title} {s.completed ? "✓" : ""}
												</div>
												{s.proof_url && (
													<div style={{ fontSize: 12 }}>
														<a href={s.proof_url} target="_blank" rel="noreferrer">
															View proof photo
														</a>
													</div>
												)}
												{s.created_at && (
													<div
														style={{
															fontSize: 11,
															opacity: 0.7,
														}}
													>
														{new Date(s.created_at).toLocaleString()}
													</div>
												)}
											</li>
										))}
									</ul>
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</main>
	);
}
