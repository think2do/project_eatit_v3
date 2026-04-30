// F-304 V32.M2.2.2 — eyebrow progress indicator on the 3 candidate-flow
// pages (Upload → Config → Interview). Single source of step labels so a
// future page-rename only needs one edit.
export type PageStep = 1 | 2 | 3;

const STEP_LABELS: Record<PageStep, string> = {
  1: "上传与解析",
  2: "面试配置",
  3: "实时面试",
};

interface Props {
  step: PageStep;
}

export function PageStepIndicator({ step }: Props): JSX.Element {
  return (
    <div className="eyebrow" style={{ marginBottom: 4 }}>
      第 {step} 步 · 共 3 步 · {STEP_LABELS[step]}
    </div>
  );
}
