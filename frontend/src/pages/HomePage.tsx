export default function HomePage() {
	return (
		<div className="relative min-h-screen flex flex-col items-center justify-center">
			<h1
				className="
        text-6xl font-['VT323'] tracking-tight text-neutral-100
        drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]
        animate-[shimmer_8s_ease_infinite]
      "
			>
				Do Stuff
			</h1>

			<p className="mt-4 text-neutral-400 font-mono tracking-widest text-sm">
				a challenge generator for getting unstuck
			</p>

			<button
				className="
          mt-12 px-10 py-4 text-xl font-['VT323']
          bg-neutral-900 border border-neutral-700 rounded-xl
          hover:border-white hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]
          transition-all duration-300
          animate-[breathe_4s_ease_in_out_infinite]
        "
				onClick={() => (window.location.href = "/challenge")}
			>
				START
			</button>
		</div>
	);
}
