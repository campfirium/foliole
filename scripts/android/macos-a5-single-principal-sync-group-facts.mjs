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
