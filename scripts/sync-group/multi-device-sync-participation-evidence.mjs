export function assertAndroidResumeData(before, after, factId, fail) {
  const beforeDatabase = before.database;
  const afterDatabase = after.database;
  const beforeFacts = beforeDatabase?.inspection?.journeyFacts ?? {};
  const afterFacts = afterDatabase?.inspection?.journeyFacts ?? {};
  const counts = ['attachments', 'content_blobs', 'nodes'];
  const retained = Object.entries(beforeFacts)
    .every(([id, origin]) => afterFacts[id] === origin);
  if (afterDatabase?.integrity !== 'ok' || afterFacts[factId] !== 'A' || !retained
      || counts.some((key) => afterDatabase.counts[key] < beforeDatabase.counts[key])) {
    throw fail(`Android did not retain resumed data: ${JSON.stringify({
      after: afterDatabase, before: beforeDatabase, factId
    })}`);
  }
}
