export function formatSyncResultMessage(message: string) {
  if (message === 'Sync checked' || message === 'Auto sync completed.') {
    return 'No changes to sync.';
  }
  if (message === 'Sync fully completed.') {
    return 'Everything was up to date.';
  }
  if (message.startsWith('Sync fully completed; ')) {
    return capitalizeFirst(message.replace('Sync fully completed; ', '').replace(/\.$/, '.'));
  }
  if (message.startsWith('Sync made progress; ')) {
    return capitalizeFirst(message.replace('Sync made progress; ', '').replace(/\.$/, '.'));
  }
  if (message.startsWith('Sync checked; ')) {
    return capitalizeFirst(message.replace('Sync checked; ', '').replace(/\.$/, '.'));
  }
  return message;
}

function capitalizeFirst(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
