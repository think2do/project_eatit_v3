import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { hasLLMApiKey } from "@/lib/llm/config";

export const ONBOARDING_GATE_QUERY_KEY = ["llm-api-key-present"] as const;

/**
 * OnboardingGate — first-run API-key nudge (defense-in-depth rewrite).
 *
 * 2026-06-04 三次拒审后的加固版本(Submission a6e822bd):
 * 渲染期**永远** `<Outlet />`,绝不返回 `<Navigate>`;首次进入根路径
 * 且未配 key 时的"引导到 /settings"通过 useEffect + useRef 实现,**每个
 * app session 最多触发一次**。如此一来:
 * - 侧边栏导航的任何渲染路径都不会被 redirect 拦截(根除 6/1、6/4 那个
 *   bug 的所有可能复发路径,包括 query 缓存/时序抖动)
 * - 全新用户首次启动仍被引导到设置页(原 UX 意图保留)
 * - 用户配过 key、之后再回到 "/" 时,不再触发任何跳转
 *
 * keychain 不可达 / 出错 → 放行,不引导,也不卡屏。
 */
function Shimmer(): JSX.Element {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          width: 220,
          height: 12,
          borderRadius: "var(--r-pill)",
          background:
            "linear-gradient(90deg, var(--bg-sunken) 0%, var(--line) 50%, var(--bg-sunken) 100%)",
          backgroundSize: "200% 100%",
          animation: "eatit-shimmer 1.4s ease-in-out infinite",
        }}
      />
    </div>
  );
}

export function OnboardingGate(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const nudgedRef = useRef(false);
  const query = useQuery({
    queryKey: ONBOARDING_GATE_QUERY_KEY,
    queryFn: () => hasLLMApiKey(),
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    // Fire AT MOST once per session, and only on initial "/" landing
    // with confirmed no-key. Subsequent navigations are never redirected,
    // no matter the query state or path.
    if (nudgedRef.current) return;
    if (query.isLoading) return;
    if (query.isError) return;
    if (query.data !== false) return;
    if (location.pathname !== "/") return;
    nudgedRef.current = true;
    navigate("/settings", { replace: true });
  }, [
    query.isLoading,
    query.isError,
    query.data,
    location.pathname,
    navigate,
  ]);

  // Initial mount before query settles → brief placeholder.
  // After that, ALWAYS render the matched route. Never <Navigate /> here.
  if (query.isLoading) return <Shimmer />;
  return <Outlet />;
}
