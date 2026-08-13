export async function enableWindowsSyncParticipation(page, invoke) {
  const overview = await invoke(page, 'enable_companion_sync');
  if (overview.sync_enabled !== true || overview.sync_paused !== false
      || overview.participating !== true) {
    throw new Error(`Windows Sync did not turn on: ${JSON.stringify(overview)}`);
  }
  return overview;
}
