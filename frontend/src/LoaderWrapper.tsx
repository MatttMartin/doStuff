// src/LoaderWrapper.tsx
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import LoadingScreen from "./components/LoadingScreen";

export default function LoaderWrapper({ children }: { children: ReactNode }) {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setReady(true), 1200);
		return () => clearTimeout(timer);
	}, []);

	if (!ready) {
		return <LoadingScreen />;
	}

	return (
		<div className="relative min-h-screen w-full bg-black text-white font-['VT323'] overflow-hidden">
			<div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-950 opacity-[0.15] animate-[hueshift_18s_linear_infinite]"></div>

			<div className="animate-[fadein_0.6s_ease_forwards] opacity-0">{children}</div>
		</div>
	);
}
