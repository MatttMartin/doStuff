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
		<div className="relative min-h-screen flex flex-col items-center justify-center px-4 text-center">
			<h1 className="text-6xl md:text-7xl font-['VT323'] text-neutral-100 drop-shadow-[0_0_10px_rgba(255,255,255,0.15)] animate-[shimmer_8s_ease_infinite]">
				Do Stuff
			</h1>

			<p className="mt-4 text-neutral-400 font-mono tracking-widest text-sm"></p>

			<button
				className="
					mt-12 px-12 py-4 text-2xl font-['VT323']
					bg-neutral-900 border border-neutral-700 rounded-xl
					hover:border-white hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]
					transition-all duration-300
					animate-[breathe_4s_ease_in_out_infinite]
				"
				onClick={() => navigate("/challenge")}
			>
				START
			</button>
		</div>
	);
}
