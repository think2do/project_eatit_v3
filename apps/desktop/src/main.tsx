import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import { queryClient } from "@/lib/query-client";
import { initSentry } from "@/lib/sentry";
import "@/index.css";

// No-op when VITE_SENTRY_DSN is empty (dev default). See lib/sentry.ts
// for the redaction contract — must stay in sync with the backend's
// observability module.
initSentry(
  (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? "",
  (import.meta.env.MODE as string | undefined) ?? "development",
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
