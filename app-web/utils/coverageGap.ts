const pad = (value: number): string => String(value).padStart(2, "0");

export function formatGapDuration(start: string, end: string): string {
  const totalSeconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (hours > 0) parts.push(`${pad(hours)}h`);
  if (hours > 0 || minutes > 0) parts.push(`${pad(minutes)}m`);
  parts.push(`${pad(totalSeconds % 60)}s`);
  return parts.join(":");
}

export function formatCoverageGap(gap: { start: string; end: string }): string {
  const start = new Date(gap.start).toISOString();
  const end = new Date(gap.end).toISOString();
  const shownEnd = start.slice(0, 10) === end.slice(0, 10) ? end.slice(11) : end;
  return `${start} – ${shownEnd}, ${formatGapDuration(start, end)}`;
}
