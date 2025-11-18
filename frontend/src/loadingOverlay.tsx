export default function LoadingOverlay() {
	return (
		<div
			className="
				fixed inset-0 z-50
				flex items-center justify-center
				bg-black/90 backdrop-blur-sm
				text-neutral-300 font-['VT323'] text-5xl
				animate-[fadein_0.4s_ease-out_forwards]
			"
		>
			<div className="animate-[flicker_1.4s_steps(2)_infinite] tracking-widest">LOADING…</div>
		</div>
	);
}
