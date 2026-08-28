export async function verifyMacosA5Restart({ env, expectedGroupId, openSession, repoRoot,
  session, sharedRoot }) {
  const beforeRestart = await session.invoke('load_workspace_list_snapshot', {
    includePdfOpenings: false
  });
  await session.close();
  const restartedSession = await openSession({ env,
    libraryHome: `${sharedRoot}/macos-library`, repoRoot,
    runtimeRoot: `${sharedRoot}/macos-runtime` });
  try {
    const restarted = await restartedSession.load();
    if (restarted.sync_group?.group_id !== expectedGroupId) {
      throw new Error('Mac did not restore its A5 Sync Group.');
    }
    await restartedSession.invoke('sync_companion_now');
    await restartedSession.invoke('sync_companion_now');
    const afterRestart = await restartedSession.invoke('load_workspace_list_snapshot', {
      includePdfOpenings: false
    });
    if (Object.keys(afterRestart.nodesById).length !== Object.keys(beforeRestart.nodesById).length) {
      throw new Error('Repeated Mac and A5 sync was not idempotent.');
    }
    return restartedSession;
  } catch (error) {
    await restartedSession.close().catch(() => undefined);
    throw error;
  }
}
