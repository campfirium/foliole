const PLATFORM_HEADING = /^> Platforms: (.+)$/u;

function platformNames(identity) {
  const names = new Map(identity.registry.platforms.map((platform) => [platform.id, platform.displayName]));
  return identity.intent.selectedPlatforms.map((id) => names.get(id));
}

export function formatReleasePlatformHeading(identity) {
  return `> Platforms: ${platformNames(identity).join(', ')}`;
}

export function assertReleaseBodyPlatformScope(body, identity) {
  const firstLine = String(body ?? '').trimStart().split(/\r?\n/u)[0];
  const match = firstLine.match(PLATFORM_HEADING);
  if (!match || firstLine !== formatReleasePlatformHeading(identity)) {
    throw new Error(`release body must begin with "${formatReleasePlatformHeading(identity)}".`);
  }
  return body;
}
