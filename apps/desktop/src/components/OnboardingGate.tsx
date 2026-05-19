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

export function OnboardingGate(): JSX.Element {
  const location = useLocation();
  const query = useQuery({
    queryKey: ["llm-api-key-present"],
    queryFn: () => hasLLMApiKey(),
    staleTime: Infinity,
    retry: false,
  });

  if (query.isLoading) return <Shimmer />;

  // keychain unreachable → don't trap the user; let them in.
  if (query.isError) return <Outlet />;

  // No API key yet → send to the API config screen (unless already there).
  if (query.data === false && location.pathname !== "/settings") {
    return <Navigate to="/settings" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
