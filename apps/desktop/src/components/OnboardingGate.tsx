import { Outlet } from "react-router-dom";

/**
 * OnboardingGate — first-run wizard gate.
 *
 * 2026-05-19:应用户要求**临时隐藏 onboarding**。原逻辑会在
 * `onboarding_completed_at` 未设置时强制重定向到 `/onboarding`。
 * 现在直接放行进主应用;`/onboarding` 路由仍保留,设置入口可手动进入。
 * 需要恢复强制引导时,`git revert` 本次改动即可(原实现见 git 历史)。
 */
export function OnboardingGate(): JSX.Element {
  return <Outlet />;
}
