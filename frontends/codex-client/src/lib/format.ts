/** 时间与文本格式化（面板与消息头共用） */

export function formatRelativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

/** 会话内的日期分隔标题：今天 HH:mm / 昨天 HH:mm / M月D日 HH:mm */
export function formatTurnDivider(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return `今天 ${time}`;
  if (t >= startOfToday - 86_400_000) return `昨天 ${time}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

export function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
