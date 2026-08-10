export const WINDOWS_SYNC_GROUP_ACTIONS = [
  'sync-group-baseline-reset', 'sync-group-recover', 'sync-group-task3',
  'sync-group-task3-protect'
];

export function isWindowsSyncGroupAction(action) {
  return WINDOWS_SYNC_GROUP_ACTIONS.includes(action);
}

export function attachSyncGroupResult(summary, result) {
  for (const key of ['syncGroupBaseline', 'syncGroupRecovery', 'syncGroupTask3',
    'syncGroupTask3Protection']) {
    if (result?.[key]) summary[key] = result[key];
  }
}

export function printSyncGroupResult(stream, summary) {
  const values = [
    ['syncGroupRecovery', 'sync-group-recover', 'receiptPath'],
    ['syncGroupBaseline', 'sync-group-baseline-reset', 'manifestPath'],
    ['syncGroupTask3', 'sync-group-task3', 'receiptPath'],
    ['syncGroupTask3Protection', 'sync-group-task3-protect', 'manifestPath']
  ];
  for (const [key, action, field] of values) {
    if (summary[key]) stream(`[windows-dev-action] ${action} identity=${summary.runId} manifest=${summary[key][field]}`);
  }
}
