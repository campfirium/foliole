interface ForegroundTimeMaintenance {
  begin(): void;
  finish(): void;
}

let recording: ForegroundTimeMaintenance | null = null;

export function registerDesktopForegroundTimeMaintenance(next: ForegroundTimeMaintenance) {
  recording = next;
}

export async function withDesktopForegroundTimeMaintenance<T>(task: () => Promise<T>,
  canFinish: () => Promise<boolean> = async () => true) {
  const current = recording;
  current?.begin();
  let failed = false;
  try { return await task(); }
  catch (error) { failed = true; throw error; }
  finally { await finishAfterTask(current, canFinish, failed); }
}

async function finishAfterTask(current: ForegroundTimeMaintenance | null, canFinish: () => Promise<boolean>, failed: boolean) {
  try { if (await canFinish()) current?.finish(); }
  catch (error) {
    if (!failed) throw error;
    console.error('[foreground-time] Failed to settle after restoration failure', error);
  }
}
