export function assertReadableDatabase(snapshot, label) {
  if (snapshot?.error) throw new Error(`${label} snapshot failed: ${snapshot.error}`);
  if (!snapshot?.database?.exists) throw new Error(`${label} Android database is missing`);
  if (snapshot.database.unreadable) throw new Error(`${label} Android database is unreadable: ${snapshot.database.error}`);
}
