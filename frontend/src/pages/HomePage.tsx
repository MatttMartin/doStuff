import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "../components/LoadingScreen";

const API_BASE = import.meta.env.VITE_API_BASE as string;

interface RunStatus {
	finished_at: string | null;
	public?: boolean;
}

export default function HomePage() {
	const navigate = useNavigate();
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function fetchRun(rid: string): Promise<RunStatus | null> {
			try {
				const res = await fetch(`${API_BASE}/runs/${rid}`);
				if (!res.ok) return null;
				return (await res.json()) as RunStatus;
			} catch {
				return null;
			}
		}

		async function checkExistingRun() {
			const lastRunId = localStorage.getItem("last_run_id");
			if (lastRunId) {
				const run = await fetchRun(lastRunId);
				if (run?.finished_at) {
					if (run.public === true) {
						// Already posted/shared; clear and allow a fresh start.
						localStorage.removeItem("last_run_id");
						localStorage.removeItem("current_run_id");
						if (!cancelled) setChecking(false);
						return;
					}
					if (!cancelled) navigate("/summary", { replace: true });
					return;
				}

				if (!run) {
					localStorage.removeItem("last_run_id");
				}
			}

			const currentRunId = localStorage.getItem("current_run_id");
			if (currentRunId) {
				const run = await fetchRun(currentRunId);

				if (run?.finished_at) {
					if (run.public === true) {
						localStorage.removeItem("last_run_id");
						localStorage.removeItem("current_run_id");
						if (!cancelled) setChecking(false);
						return;
					}
					localStorage.setItem("last_run_id", currentRunId);
					localStorage.removeItem("current_run_id");
					if (!cancelled) navigate("/summary", { replace: true });
					return;
				}

				if (run) {
					if (!cancelled) navigate("/challenge");
					return;
				}

				localStorage.removeItem("current_run_id");
			}

			if (!cancelled) setChecking(false);
		}

		checkExistingRun();

		return () => {
			cancelled = true;
		};
	}, [navigate]);

	// While checking localStorage, show loading screen
	if (checking) {
		return <LoadingScreen />;
	}

	return (
		<div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-black via-neutral-950 to-black px-6 py-14 md:py-20">
			{/* Ambient glow layers */}
			<div
				className="absolute inset-0 pointer-events-none opacity-30"
				style={{
					backgroundImage:
						"radial-gradient(circle at 20% 20%, rgba(0,255,255,0.2), transparent 55%), radial-gradient(circle at 80% 0%, rgba(255,0,153,0.18), transparent 50%)",
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

			<div className="relative z-10 flex flex-col items-center text-center text-neutral-100 font-['VT323'] max-w-5xl w-full scale-[1.15] md:scale-[1.25]">
				<p className="text-sm md:text-base uppercase tracking-[0.6em] text-neutral-500 mb-4">By Matthew Martin</p>
				<h1 className="text-8xl sm:text-9xl md:text-[96px] drop-shadow-[0_0_18px_rgba(255,255,255,0.22)] leading-none">
					Do Stuff
				</h1>
				<p className="mt-4 text-sm sm:text-lg md:text-xl text-neutral-300 font-mono tracking-[0.45em]">
					Can you... do stuff?
				</p>

				<div className="mt-14 flex flex-col items-center gap-5">
					<button
						type="button"
						onClick={() => navigate("/challenge")}
						className="group relative w-full max-w-sm rounded-3xl border border-neutral-700 bg-black/70 px-10 py-5 text-xl md:text-[22px] tracking-[0.38em] text-neutral-100 transition-all duration-200 hover:border-cyan-400 hover:text-cyan-200 hover:shadow-[0_0_25px_rgba(0,255,255,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
					>
						<span
							className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-transparent to-transparent opacity-0 blur-lg transition-opacity duration-300 group-hover:opacity-100"
							aria-hidden
						/>
						<span className="flex items-center justify-center gap-2">
							<span className="h-2 w-2 rounded-sm bg-red-500 animate-pulse" aria-hidden />
							START
						</span>
					</button>
					<div className="flex items-center gap-4 text-xs md:text-sm font-mono uppercase tracking-[0.35em] text-neutral-500">
						<span className="flex items-center gap-1">
							<span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-ping" aria-hidden />
							ready
						</span>
						<span className="h-px w-8 bg-neutral-700" aria-hidden />
						<span className="text-neutral-400 text-[11px] md:text-xs">v.0.0.1</span>
					</div>
				</div>

				<button
					type="button"
					onClick={() => navigate("/feed")}
					className="mt-10 text-xs md:text-sm font-mono uppercase tracking-[0.45em] text-neutral-500 hover:text-cyan-300 transition-colors duration-200"
				>
					<div className="inline-flex items-center gap-3">
						<span className="h-1 w-8 bg-neutral-700" aria-hidden />
						<span>view feed</span>
						<span className="h-1 w-8 bg-neutral-700" aria-hidden />
					</div>
				</button>
			</div>
		</div>
	);
}
