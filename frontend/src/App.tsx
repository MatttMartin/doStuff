// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ChallengePage from "./pages/ChallengePage";
import SummaryPage from "./pages/SummaryPage";

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/challenge" element={<ChallengePage />} />
				<Route path="/summary" element={<SummaryPage />} />
			</Routes>
		</BrowserRouter>
	);
}
