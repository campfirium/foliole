export async function finalizeDesktopFixture({
  attachDiagnostics,
  attachEvidence,
  close,
  failed
}) {
  const errors = [];
  try {
    await attachEvidence();
  } catch (error) {
    errors.push(error);
  }
  if (failed) {
    try {
      await attachDiagnostics();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) throw new AggregateError(errors, 'desktop fixture teardown failed');
}
