export interface UpdateTarget {
  architecture: 'arm64' | 'x64';
  platform: 'linux' | 'macos' | 'windows';
}

export function resolveRuntimeUpdateTarget(
  platform = navigator.platform,
  userAgent = navigator.userAgent
): UpdateTarget {
  const identity = `${platform} ${userAgent}`.toLowerCase();
  if (identity.includes('mac')) return { architecture: 'arm64', platform: 'macos' };
  if (identity.includes('linux')) return { architecture: 'x64', platform: 'linux' };
  return { architecture: 'x64', platform: 'windows' };
}

export function releaseMatchesTarget(
  release: { architectures?: string[]; platforms: string[] },
  target: UpdateTarget
) {
  return release.platforms.includes(target.platform)
    && (!release.architectures?.length || release.architectures.includes(target.architecture));
}
