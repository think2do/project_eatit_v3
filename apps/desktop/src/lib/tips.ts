import localTipsRaw from "@/data/tips.json";

export interface TipsCard {
  id: string;
  content: string;
  category: string;
}

const localTips: TipsCard[] = localTipsRaw as TipsCard[];

export type TipsContext = "parsing" | "report_generating";

const PERSONALIZED_THRESHOLD_SESSIONS = 3;
const MIN_TIPS_TO_SHOW = 5;

/**
 * Pick which tips to show during a long-running operation. Behaviour:
 *
 * - sessionCount < 3 OR no personalized cache → use the local 25-item
 *   library as-is. Brand-new users haven't generated enough signal for
 *   personalized tips to be useful, so we don't even try.
 * - sessionCount ≥ 3 AND personalized cache is non-empty → personalized
 *   tips lead. If fewer than 5, top up from the local library so the
 *   carousel always has at least 5 cards to rotate through.
 *
 * The `context` arg is reserved for future ranking (parsing vs.
 * report_generating tend to want different sub-categories — opening
 * tips vs. retrospective tips). For now both contexts return the same
 * library; the ranking lives in M2.2 / M2.3.
 */
export function selectTips(
  _context: TipsContext,
  sessionCount: number,
  personalizedCache: TipsCard[] = [],
): TipsCard[] {
  if (
    sessionCount >= PERSONALIZED_THRESHOLD_SESSIONS &&
    personalizedCache.length > 0
  ) {
    const merged: TipsCard[] = [...personalizedCache];
    if (merged.length < MIN_TIPS_TO_SHOW) {
      const supplement = localTips.slice(0, MIN_TIPS_TO_SHOW - merged.length);
      merged.push(...supplement);
    }
    return merged;
  }
  return localTips;
}

/**
 * Hard-coded last-resort tips. Returned by the carousel only if the
 * static-import resolution somehow yields an empty array (e.g. corrupted
 * build asset). Has to be ≥ 5 so the carousel still has something to
 * rotate through.
 */
export function getFallbackTips(): TipsCard[] {
  return [
    {
      id: "fallback-1",
      content: "保持自然语速,语速适中比快或慢都好",
      category: "收尾",
    },
    {
      id: "fallback-2",
      content: "回答前花 3 秒打个简短结构,STAR / 因果三段式都可以",
      category: "开场",
    },
    {
      id: "fallback-3",
      content: "用\"我\"而不是\"我们\",清晰说明你个人的贡献占比",
      category: "表达",
    },
    {
      id: "fallback-4",
      content: "数据要具体:\"季度环比 35%\" 比 \"明显增长\" 更可信",
      category: "数据",
    },
    {
      id: "fallback-5",
      content: "技术决策题别只说选了什么,把放弃的方案 + 取舍说出来",
      category: "决策",
    },
    {
      id: "fallback-6",
      content: "失败经历题重点不是 bug 本身,而是定位过程 + 复盘动作",
      category: "决策",
    },
    {
      id: "fallback-7",
      content: "结尾留一个钩子,方便面试官继续追问",
      category: "收尾",
    },
    {
      id: "fallback-8",
      content: "面试官沉默通常是在记笔记,不要急着补救",
      category: "收尾",
    },
  ];
}
