// F-305 V32.M2.2.3 — short Chinese relative-time helper for "由 AI · N 秒前生成".
// Falls back to "刚刚" within the first 5 seconds; everything past 24h is in days.
export function formatRelativeTime(timestamp: Date | string | number): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 5) return "刚刚";
  if (sec < 60) return `${sec} 秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  return `${Math.floor(sec / 86400)} 天前`;
}
