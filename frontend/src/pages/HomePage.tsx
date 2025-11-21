import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingScreen from "../components/LoadingScreen";

export default function HomePage() {
	const navigate = useNavigate();
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		const rid = localStorage.getItem("current_run_id");

		// If there is an active run, instantly redirect to challenge page
		if (rid) {
			navigate("/challenge");
			return;
		}

		// No active run - allow homepage to show
		setChecking(false);
	}, []);

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

			<div className="relative z-10 flex flex-col items-center text-center text-neutral-100 font-['VT323'] max-w-4xl w-full scale-[1.05] md:scale-[1.15]">
				<p className="text-sm md:text-base uppercase tracking-[0.6em] text-neutral-500 mb-6">By Matthew Martin</p>
				<h1 className="text-6xl sm:text-7xl md:text-8xl drop-shadow-[0_0_18px_rgba(255,255,255,0.22)] leading-none">
					Do Stuff
				</h1>
				<p className="mt-6 text-base sm:text-xl md:text-2xl text-neutral-300 font-mono tracking-[0.5em]">Can you... do stuff?</p>

				<div className="mt-12 flex flex-col items-center gap-5">
					<button
						type="button"
						onClick={() => navigate("/challenge")}
						className="group relative w-full max-w-sm rounded-3xl border border-neutral-700 bg-black/70 px-10 py-5 text-3xl tracking-[0.45em] text-neutral-100 transition-all duration-200 hover:border-cyan-400 hover:text-cyan-200 hover:shadow-[0_0_25px_rgba(0,255,255,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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
					<div className="flex items-center gap-4 text-sm md:text-base font-mono uppercase tracking-[0.4em] text-neutral-500">
						<span className="flex items-center gap-1">
							<span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-ping" aria-hidden />
							ready
						</span>
						<span className="h-px w-8 bg-neutral-700" aria-hidden />
						<span className="text-neutral-400">v.0.0.1</span>
					</div>
				</div>

				<button
					type="button"
					onClick={() => navigate("/feed")}
					className="mt-20 text-sm md:text-base font-mono uppercase tracking-[0.55em] text-neutral-500 hover:text-cyan-300 transition-colors duration-200"
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
