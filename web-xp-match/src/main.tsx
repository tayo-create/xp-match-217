import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import { installCrashReporting } from "./lib/beta";
import "./index.css";

installCrashReporting();

createRoot(document.getElementById("root")!).render(<App />);
