function noteArray(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  return value;
}

export function validateReleaseNotesRecord(record, identity, label = 'release notes') {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`${label} are missing.`);
  }
  const notes = noteArray(record.notes ?? [], `${label}.notes`);
  const platformNotes = record.platformNotes ?? {};
  if (!platformNotes || typeof platformNotes !== 'object' || Array.isArray(platformNotes)) {
    throw new Error(`${label}.platformNotes must be an object.`);
  }
  const selected = new Set(identity.intent.selectedPlatforms);
  for (const [platform, entries] of Object.entries(platformNotes)) {
    if (!selected.has(platform)) {
      throw new Error(`${label}.platformNotes.${platform} is outside the published platform scope.`);
    }
    noteArray(entries, `${label}.platformNotes.${platform}`);
  }
  if (!notes.length && !Object.keys(platformNotes).length && !record.summary) {
    throw new Error(`${label} must contain shared or platform-limited changes.`);
  }
  return { notes, platformNotes };
}

export function assertLocalizedReleaseNotesScope(catalogs, identity, version) {
  const scopes = Object.entries(catalogs).map(([locale, catalog]) => {
    const record = catalog?.[version];
    const normalized = validateReleaseNotesRecord(record, identity, `${locale} ${version} release notes`);
    return [locale, Object.keys(normalized.platformNotes).sort().join(',')];
  });
  const expected = scopes[0]?.[1];
  if (scopes.some(([, scope]) => scope !== expected)) {
    throw new Error('localized release notes must declare the same platform-limited scopes.');
  }
  return true;
}
