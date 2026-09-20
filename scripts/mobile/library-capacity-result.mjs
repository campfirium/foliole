export function parseLibraryCapacityResult(output) {
  const prefix = 'FOLIOLE_LIBRARY_CAPACITY_RESULT=';
  const matches = String(output).split(/\r?\n/u).filter(line => line.includes(prefix));
  if (matches.length !== 1) throw new Error('Expected one complete library capacity result.');
  const result = JSON.parse(matches[0].slice(matches[0].indexOf(prefix) + prefix.length));
  if (result.status !== 'passed' || result.scenario !== 'library-capacity'
    || result.appId !== 'com.foliole.android.acceptance' || result.platform !== 'android'
    || result.results?.length !== 2) throw new Error('Invalid isolated capacity result.');
  for (const [index, count] of [1000, 10000].entries()) {
    const entry = result.results[index];
    if (entry.fixture?.count !== count || entry.fixture?.bodyBytes !== 4096
      || entry.fixture.imports !== 0 || entry.fixture.analyzed !== false
      || entry.runs?.length !== 4 || !entry.environment?.version?.length || !entry.plans?.length) {
      throw new Error('Incomplete capacity measurements.');
    }
    const hash = entry.runs[0].snapshotHash;
    if (!/^[a-f0-9]{64}$/u.test(hash) || entry.runs.some(run => run.snapshotHash !== hash
      || !Number.isFinite(run.totalMs) || run.totalMs < 0
      || !Number.isFinite(run.queryWallMs) || !Number.isFinite(run.jsResidualMs))) {
      throw new Error('Invalid capacity timing or snapshot consistency.');
    }
  }
  return result;
}
