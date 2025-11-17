// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LoaderWrapper from "./LoaderWrapper";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<LoaderWrapper>
			<App />
		</LoaderWrapper>
	</React.StrictMode>
);
