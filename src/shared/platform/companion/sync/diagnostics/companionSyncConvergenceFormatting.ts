export function formatSyncConvergenceCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatRemainingSyncSegments(args: {
  dirtyCount: number;
  lag: number;
  missingAttachments: number;
  missingBodies: number;
  pendingAckCount: number;
  pushIssueCount: number;
}) {
  return [
    formatSyncConvergenceCount(args.dirtyCount, 'device change', 'device changes'),
    formatSyncConvergenceCount(args.pendingAckCount, 'desktop confirmation', 'desktop confirmations'),
    formatSyncConvergenceCount(args.pushIssueCount, 'change issue', 'change issues'),
    formatSyncConvergenceCount(args.missingBodies, 'topic body file', 'topic body files'),
    formatSyncConvergenceCount(args.missingAttachments, 'attachment file', 'attachment files'),
    formatSyncConvergenceCount(args.lag, 'topic list change', 'topic list changes')
  ].join(', ');
}
