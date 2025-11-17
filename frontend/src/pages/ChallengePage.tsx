import { useEffect, useState } from "react";

export default function ChallengePage() {
	const [challenge, setChallenge] = useState<any>(null);
	const [timeLeft, setTimeLeft] = useState(0);
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);

	// Fetch the first challenge
	useEffect(() => {
		async function load() {
			try {
				const res = await fetch(import.meta.env.VITE_API_BASE + "/levels");
				const data = await res.json();
				setChallenge(data[0]); // just show first level
				setTimeLeft(data[0].seconds_limit || 60);
			} catch (e) {
				console.error(e);
			}
		}
		load();
	}, []);

	// Countdown
	useEffect(() => {
		if (timeLeft <= 0) return;
		const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
		return () => clearInterval(timer);
	}, [timeLeft]);

	function formatTime(sec: number) {
		const h = Math.floor(sec / 3600)
			.toString()
			.padStart(2, "0");
		const m = Math.floor((sec % 3600) / 60)
			.toString()
			.padStart(2, "0");
		const s = (sec % 60).toString().padStart(2, "0");
		return `${h}:${m}:${s}`;
	}

	function handleFile(e: any) {
		const f = e.target.files[0];
		setFile(f);
		setPreview(URL.createObjectURL(f));
	}

	return (
		<div className="w-full max-w-lg mx-auto space-y-8 text-center">
			{/* challenge title */}
			<h2 className="text-3xl font-semibold text-blue-300">{challenge ? challenge.title : "Loading..."}</h2>

			{/* description */}
			<p className="text-gray-300">{challenge?.description}</p>

			{/* Timer */}
			<div className="text-5xl font-bold text-yellow-400">{formatTime(timeLeft)}</div>

			{/* Photo upload */}
			<label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-500 rounded-xl cursor-pointer hover:border-blue-400 transition">
				<input type="file" className="hidden" onChange={handleFile} />
				{preview ? (
					<img src={preview} className="h-full object-contain rounded-xl" />
				) : (
					<span className="text-gray-400">Upload proof</span>
				)}
			</label>

			{/* Done button */}
			<button className="bg-green-500 hover:bg-green-600 px-10 py-4 text-xl rounded-2xl shadow-lg transition">
				Done
			</button>
		</div>
	);
}
