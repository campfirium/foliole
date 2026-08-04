export function assertReleaseBodyPresentation(body) {
  const value = String(body ?? '').trim();
  if (!value) throw new Error('release body must not be empty.');
  if (/^> Platforms:/u.test(value)) {
    throw new Error('release body must not expose internal platform scope metadata.');
  }
  return body;
}
