let activeRestoreSettlement: Promise<void> | null = null;

export function beginApplicationDatabaseRestore() {
  if (activeRestoreSettlement) {
    throw new Error('Another backup restore is already in progress.');
  }
  let resolveSettlement = () => {};
  const settlement = new Promise<void>((resolve) => {
    resolveSettlement = resolve;
  });
  activeRestoreSettlement = settlement;
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    resolveSettlement();
    if (activeRestoreSettlement === settlement) {
      activeRestoreSettlement = null;
    }
  };
}

export async function waitForApplicationDatabaseRestoreSettlement() {
  await activeRestoreSettlement;
}
