import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hasLLMApiKey } from "@/lib/llm/config";

/**
 * OnboardingGate — first-run API-key gate.
 *
 * 2026-05-19:onboarding 向导已隐藏(见 git 历史)。改为按「是否配过
 * API Key」把关:没配过 key 的用户(全新用户)进任意页都先重定向到
 * `/settings`(配置 API 的界面),配过 key 后正常进主应用。
 * 已在 /settings 时不再重定向,避免自跳循环。
 * keychain 不可达(开发壳 / 出错)时放行,不把用户卡在占位屏。
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

export const ONBOARDING_GATE_QUERY_KEY = ["llm-api-key-present"] as const;

/**
 * 2026-06-01 修复 Apple 二次拒审(Guideline 2.1a):之前实现 "无 key 且
 * pathname !== /settings → redirect /settings" 把侧边栏每个点击都弹回
 * 设置页,审核员表现为"侧边栏点啥都没反应"。
 *
 * 现在只在**初次从根路径 `/` 进入**且无 key 时 redirect 一次(原"全新
 * 用户引导"意图保留);用户从侧边栏主动点的任何路径,gate 全部放行。
 */
export function OnboardingGate(): JSX.Element {
  const location = useLocation();
  const query = useQuery({
    queryKey: ONBOARDING_GATE_QUERY_KEY,
    queryFn: () => hasLLMApiKey(),
    staleTime: Infinity,
    retry: false,
  });

  if (query.isLoading) return <Shimmer />;

  // keychain unreachable → don't trap the user; let them in.
  if (query.isError) return <Outlet />;

  // First-run only: from the root path, if no key, nudge to /settings once.
  // Any other path (sidebar navigation) is never blocked, even without a key.
  if (query.data === false && location.pathname === "/") {
    return <Navigate to="/settings" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
