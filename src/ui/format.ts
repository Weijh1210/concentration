export function formatTimer(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatMinutes(milliseconds: number): string {
  if (milliseconds > 0 && milliseconds < 60_000) return `${Math.max(1, Math.floor(milliseconds / 1000))} 秒`;
  return `${Math.floor(milliseconds / 60_000)} 分钟`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
