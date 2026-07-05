/** Turn `2026-01` into "January 2026" for merchant-facing copy. */
export function formatJoinMonth(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  if (!year || !monthNum) return month;
  return new Date(Date.UTC(year, monthNum - 1, 1)).toLocaleDateString(
    undefined,
    { month: 'long', year: 'numeric' },
  );
}

/** e.g. "January 2026 subscribers" */
export function formatSubscriberGroup(month: string): string {
  return `${formatJoinMonth(month)} subscribers`;
}

/** Human label for months since signup (M0 = signup month). */
export function formatMonthsAfterSignup(index: number): string {
  if (index === 0) return 'At signup';
  if (index === 1) return '1 mo later';
  return `${index} mo later`;
}

/** Short column header for the retention grid. */
export function formatRetentionColumn(index: number): string {
  if (index === 0) return 'Start';
  return `+${index}mo`;
}
