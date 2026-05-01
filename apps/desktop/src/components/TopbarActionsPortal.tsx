// V32.M1.1.X-followup — page-level Topbar actions portal.
//
// design-reference/page-live.jsx mounts REC + 暂停 + 结束面试 inside the
// global Topbar's right side. To avoid coupling the shared Topbar to
// page-specific chrome, Topbar exposes a fixed DOM slot
// (`TOPBAR_ACTIONS_SLOT_ID`) and pages render into it via
// React's createPortal.
//
// Usage:
//   <TopbarActionsPortal>
//     <RecBadge ... />
//     <button>暂停</button>
//   </TopbarActionsPortal>
//
// On mount, children are appended to the slot DOM node; on unmount,
// React tears them down automatically. Pages that don't render the
// portal leave the slot empty (no whitespace because of flex layout).

import type * as React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TOPBAR_ACTIONS_SLOT_ID } from "@/components/Topbar";

export function TopbarActionsPortal({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element | null {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // The slot is a static descendant of AppShell's Topbar, mounted
    // before any page route renders. We still defer the lookup to an
    // effect so Tauri's webview hydration ordering is respected and
    // SSR-style mismatches stay impossible.
    setTarget(document.getElementById(TOPBAR_ACTIONS_SLOT_ID));
  }, []);

  if (!target) return null;
  return createPortal(children, target);
}
