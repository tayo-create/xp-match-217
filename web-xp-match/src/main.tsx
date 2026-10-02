import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import { installCrashReporting } from "./lib/beta";
import { installChunkRecovery } from "./lib/lazy-route";
import "./index.css";

installChunkRecovery();
installCrashReporting();

createRoot(document.getElementById("root")!).render(<App />);
