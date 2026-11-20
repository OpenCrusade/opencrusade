import "./zod-setup";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import { App } from "./app/App";
import { useToasts } from "./stores/toasts";

// Never run inside another site's frame: a page that could draw over
// the app could trick someone into pressing its buttons.
if (window.top !== window.self) {
  document.documentElement.replaceChildren();
  throw new Error("OpenCrusade does not run inside a frame.");
}

// When a new version has been downloaded, say so and let the user
// switch to it, instead of running old code until every tab is closed.
const updateApp = registerSW({
  onNeedRefresh: () =>
    useToasts.getState().show("A new version of OpenCrusade is ready.", "info", {
      sticky: true,
      action: { label: "Reload", run: () => void updateApp(true) },
    }),
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[app] unhandled error", event.reason);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
