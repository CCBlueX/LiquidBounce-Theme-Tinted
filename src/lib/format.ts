/** "SURVIVAL" or "survival" as "Survival". */
export const capitalize = (token: string) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();

export function relativeTime(ms: number, now = Date.now()) {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
  const time = new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return new Date(ms).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function absoluteTime(ms: number) {
  return new Date(ms).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
