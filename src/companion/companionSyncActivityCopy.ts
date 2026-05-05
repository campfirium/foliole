export function formatSyncResultMessage(message: string) {
  const displayMessage = stripDiagnosticSuffixes(message);
  if (isSyncCheckOnlyMessage(displayMessage)) {
    return 'No changes to sync.';
  }
  if (displayMessage.startsWith('Sync fully completed; ')) {
    return capitalizeFirst(displayMessage.replace('Sync fully completed; ', '').replace(/\.$/, '.'));
  }
  if (displayMessage.startsWith('Sync made progress; ')) {
    return capitalizeFirst(displayMessage.replace('Sync made progress; ', '').replace(/\.$/, '.'));
  }
  if (displayMessage.startsWith('Sync checked; ')) {
    return capitalizeFirst(displayMessage.replace('Sync checked; ', '').replace(/\.$/, '.'));
  }
  return displayMessage;
}

export function isSyncCheckOnlyMessage(message: string) {
  const displayMessage = stripDiagnosticSuffixes(message);
  return displayMessage === 'Sync checked' ||
    displayMessage === 'Auto sync completed.' ||
    displayMessage === 'Sync fully completed.';
}

export function isReportableSyncEvent(event: { message: string; status: string }) {
  return event.status !== 'started' && !(event.status === 'completed' && isSyncCheckOnlyMessage(event.message));
}

function stripDiagnosticSuffixes(message: string) {
  return message
    .replace(/;\s*timing:.*$/i, '.')
    .replace(/;\s*body internals:.*$/i, '.');
}

function capitalizeFirst(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
