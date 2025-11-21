export default function LoadingScreen() {
	return (
		<div className="relative min-h-screen w-full bg-black text-white font-['VT323'] overflow-hidden">
			<div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-black to-neutral-950 opacity-[0.15] animate-[hueshift_18s_linear_infinite]"></div>

			<div className="absolute inset-0 flex items-center justify-center text-neutral-300 text-4xl">
				<p className="animate-[flicker_1.4s_steps(2)_infinite] tracking-widest">LOADING…</p>
			</div>
		</div>
	);
}
