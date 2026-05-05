/**
 * M5.3 — Eatit.app E2E launch harness (scaffold).
 *
 * Architectural constraint (§A0 Tauri excluded):
 *   Tauri is permanently excluded from v3.4 (see .ralph/specs §A0). The app is
 *   a native macOS WKWebView host built with Xcode. Playwright's `_electron`
 *   API targets Electron's remote-debugging protocol and does NOT work for
 *   native WKWebView apps on macOS.
 *
 *   Safari WebDriver (safaridriver) can only attach to Safari.app, not to a
 *   WKWebView inside a third-party app. WebDriverAgent is iOS-focused.
 *
 *   Full E2E automation against the running Eatit.app WKWebView requires a
 *   Swift XCTest UI target that bridges JS calls into the webview via a custom
 *   evaluateJavaScript() harness — out of scope for M5.3.
 *
 * Current mode (M5.3):
 *   - `buildEatitApp` — compiles the .app via xcodebuild (verifies compiler +
 *     signing work in this env).
 *   - `launchEatitApp` — opens the .app via BSD `open -a`; returns the spawned
 *     child process for lifecycle management.
 *   - `attachPlaywright` — stub that throws a documented error; full bridge is
 *     deferred to M5.3-extended / M6.X.
 *
 * Future mode (M5.3-extended / M6.X):
 *   A Swift XCTest UI target launches the app, injects a JS test-hook object
 *   into WKWebView via evaluateJavaScript(), then Playwright (or a custom WS
 *   bridge) drives the UI through that hook. See operator playbook in
 *   scripts/build-and-test-e2e.sh for the manual equivalent.
 */

import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// ESM-compatible __dirname equivalent.
const _dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root relative to this file: apps/desktop/tests/e2e → repo root */
const REPO_ROOT = resolve(_dirname, "../../../../");

const XCODEPROJ = join(REPO_ROOT, "apps/macos/Eatit.xcodeproj");

/**
 * Where xcodebuild writes derived data when invoked from `apps/desktop/`.
 * The script uses `build/` relative to `apps/desktop/` so the .app ends up
 * at `apps/desktop/build/Build/Products/Debug/Eatit.app`.
 */
const DERIVED_DATA = join(REPO_ROOT, "apps/desktop/build");
const APP_PATH = join(DERIVED_DATA, "Build/Products/Debug/Eatit.app");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildResult {
  appPath: string;
  alreadyBuilt: boolean;
}

/**
 * Build the Eatit.app via xcodebuild.
 *
 * Uses `CODE_SIGN_STYLE=Automatic` for local dev; CI must set
 * `CODE_SIGN_IDENTITY` and `DEVELOPMENT_TEAM` via env or provisioning profile.
 *
 * Returns the resolved .app path on success; throws on build failure.
 */
export function buildEatitApp(): BuildResult {
  if (existsSync(APP_PATH)) {
    console.log(`[M5.3] Eatit.app already present at:\n  ${APP_PATH}`);
    return { appPath: APP_PATH, alreadyBuilt: true };
  }

  console.log("[M5.3] Running xcodebuild build …");
  execSync(
    [
      "xcodebuild build",
      `-project ${XCODEPROJ}`,
      `-scheme Eatit`,
      `-destination "platform=macOS"`,
      `-derivedDataPath ${DERIVED_DATA}`,
      // project.yml sets CODE_SIGN_STYLE=Manual + CODE_SIGN_IDENTITY=
      // "Developer ID Application" (DEVELOPMENT_TEAM=469QTH6TU2).
      // Pass those same values to avoid the Automatic-vs-Manual conflict error.
      `CODE_SIGN_STYLE=Manual`,
      `CODE_SIGN_IDENTITY="Developer ID Application"`,
      `DEVELOPMENT_TEAM=469QTH6TU2`,
    ].join(" "),
    { stdio: "inherit" },
  );

  if (!existsSync(APP_PATH)) {
    throw new Error(
      `[M5.3] xcodebuild finished but .app not found at expected path:\n  ${APP_PATH}\n` +
        `Check derivedDataPath layout — it may differ between Xcode versions.`,
    );
  }

  console.log(`[M5.3] Build succeeded. .app path:\n  ${APP_PATH}`);
  return { appPath: APP_PATH, alreadyBuilt: false };
}

export interface LaunchedApp {
  pid: number;
  appPath: string;
  process: ChildProcess;
}

/**
 * Launch the Eatit.app via BSD `open -a`.
 *
 * `open` is non-blocking: it hands the app to macOS Launch Services and
 * returns immediately. The returned ChildProcess represents the `open` command
 * itself, not the app process — use `pid` only as a correlation handle.
 *
 * Cleanup: call `process.kill()` on the returned ChildProcess to kill `open`;
 * the app itself must be quit separately via `osascript -e 'quit app "Eatit"'`
 * or `pkill Eatit` if needed in teardown.
 */
export async function launchEatitApp(appPath: string): Promise<LaunchedApp> {
  return new Promise((resolveP, reject) => {
    const child = spawn("open", ["-a", appPath, "--wait-apps"], {
      stdio: "inherit",
      detached: false,
    });

    child.on("error", (err) => reject(err));

    // `open --wait-apps` blocks until the launched app exits; give it a
    // moment to start before resolving so callers can assume the app is
    // at least in the process list.
    setTimeout(() => {
      if (child.pid === undefined) {
        reject(new Error("[M5.3] open command failed to start"));
        return;
      }
      resolveP({ pid: child.pid, appPath, process: child });
    }, 1500);
  });
}

/**
 * Stub: attach a Playwright Page to a running Eatit.app WKWebView.
 *
 * This is NOT implemented in M5.3. The stub exists to:
 *   1. Establish the intended API surface for M5.3-extended / M6.X.
 *   2. Fail fast with a descriptive error if mistakenly called.
 *
 * Full implementation requires:
 *   a. A Swift XCTest UI target that calls `webView.evaluateJavaScript()`
 *      to install a JS test-hook object (e.g., `window.__E2E__`).
 *   b. A WebSocket bridge (or XPC) between the XCTest harness and this TS
 *      module so Playwright can send commands and receive results.
 *   c. Possibly a custom Playwright browser server shim that tunnels CDP-like
 *      messages through that bridge.
 *
 * See operator playbook in apps/desktop/scripts/build-and-test-e2e.sh §Step 4.
 */
export async function attachPlaywright(_app: LaunchedApp): Promise<never> {
  throw new Error(
    "M5.3-stub: WKWebView Playwright bridge requires a Swift XCTest UI target " +
      "that injects a JS hook via evaluateJavaScript() and exposes a WS bridge. " +
      "Full automation is deferred to M5.3-extended / M6.X. " +
      "Operator playbook: build .app, open it manually, attach Web Inspector " +
      "(Safari → Develop → <device> → Eatit → localhost) for interactive debugging.",
  );
}
