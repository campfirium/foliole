export function normalizeCloudflareProjectName(value: string) {
  const name = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/u.test(name)) {
    throw new Error('Use 1–58 lowercase letters, numbers, or hyphens for the Pages project name.');
  }
  return name;
}
