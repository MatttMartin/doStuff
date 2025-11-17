import { useEffect, useState } from "react";

export default function LoaderWrapper({ children }: { children: React.ReactNode }) {
	const [ready, setReady] = useState(false);

	// Simulate loading everything (API, fonts, etc)
	useEffect(() => {
		const timer = setTimeout(() => setReady(true), 1200);
		return () => clearTimeout(timer);
	}, []);

	return (
		<div className="relative min-h-screen w-full bg-black text-white overflow-hidden">
			{/* Slow hue-shift background */}
			<div className="absolute inset-0 animate-[hueshift_18s_linear_infinite] opacity-[0.15] bg-gradient-to-br from-neutral-800 via-neutral-900 to-black"></div>

			{!ready ? (
				<div className="absolute inset-0 flex flex-col items-center justify-center">
					{/* Subtle glowing square */}
					<div
						className="w-32 h-32 border border-neutral-700 rounded-xl
                          animate-[pulse_2.4s_ease_in_out_infinite] opacity-60 blur-[1px]"
					></div>

					<p className="mt-8 font-mono text-neutral-400 animate-[pulse_1.8s_ease_in_out_infinite]">Loading…</p>
				</div>
			) : (
				<div className="animate-[fadein_0.6s_ease_forwards] opacity-0">{children}</div>
			)}
		</div>
	);
}
