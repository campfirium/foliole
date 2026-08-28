export function inspectExpectedJourneyFacts(database, expectedFacts) {
  const ids = expectedFacts.map(({ factId }) => factId);
  const placeholders = ids.map(() => '?').join(', ');
  const foundIds = ids.length === 0 ? [] : database.prepare(`SELECT id FROM nodes
    WHERE deleted_at IS NULL AND id IN (${placeholders})`).all(...ids).map(({ id }) => id);
  const found = new Set(foundIds);
  return {
    foundIds,
    missingIds: ids.filter((id) => !found.has(id)),
    origins: [...new Set(expectedFacts.filter(({ factId }) => found.has(factId))
      .map(({ origin }) => origin))].sort()
  };
}

export function inspectTwoDeviceJourneyFacts(database) {
  const rows = database.prepare(`SELECT id, title FROM nodes
    WHERE deleted_at IS NULL AND title LIKE 'Multi-device sync % fact%'`).all();
  const origins = rows.flatMap(({ title }) => {
    const match = String(title).match(/^Multi-device sync ([AB]) fact/u);
    return match ? [match[1]] : [];
  });
  return { foundIds: rows.map(({ id }) => id),
    originCounts: Object.fromEntries(['A', 'B'].map((origin) => [origin,
      origins.filter((value) => value === origin).length])), origins: [...new Set(origins)].sort() };
}
