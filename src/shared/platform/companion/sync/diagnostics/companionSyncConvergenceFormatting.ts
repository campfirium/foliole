export function formatSyncConvergenceCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatRemainingSyncSegments(args: {
  dirtyCount: number;
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
    formatSyncConvergenceCount(args.missingAttachments, 'attachment file', 'attachment files')
  ].join(', ');
}
