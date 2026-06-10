export const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

export const TEST_FILE_PATTERN = /(?:^|\.)(?:test|spec)\.[cm]?[jt]sx?$/;

export const TOPOLOGY_UNITS = [
  {
    id: 'core',
    tier: 'core',
    host: 'shared',
    paths: ['lib/core/'],
    role: 'Shared business core; no renderer runtime or host API dependencies.'
  },
  {
    id: 'platform-contract',
    tier: 'platform-contract',
    host: 'shared',
    paths: ['lib/platform/'],
    role: 'Native command ids, payload types, and cross-host contracts.'
  },
  {
    id: 'runtime-adapter',
    tier: 'runtime-adapter',
    host: 'shared',
    paths: ['src/shared/platform/'],
    role: 'Renderer-side runtime adapter facade; not a business truth layer.'
  },
  {
    id: 'desktop-renderer',
    tier: 'renderer-shell',
    host: 'desktop',
    paths: ['src/app/'],
    role: 'Desktop renderer shell and desktop-only renderer composition.'
  },
  {
    id: 'mobile-renderer',
    tier: 'renderer-shell',
    host: 'mobile',
    paths: ['src/companion/'],
    role: 'Mobile renderer shell, routing, touch interaction, and mobile density.'
  },
  {
    id: 'web-guides-renderer',
    tier: 'renderer-shell',
    host: 'web-guides',
    paths: ['src/web-guides/'],
    role: 'Static Web Guides renderer shell; no host runtime, write path, or native adapter dependencies.'
  },
  {
    id: 'renderer-business',
    tier: 'renderer-business',
    host: 'shared',
    paths: ['src/features/', 'src/store/', 'src/shared/diagnostics/'],
    role: 'Shared renderer business and diagnostics consumers.'
  },
  {
    id: 'electron-host',
    tier: 'host-adapter',
    host: 'electron',
    paths: ['electron/'],
    role: 'Electron main, preload, IPC, lifecycle, and desktop runtime glue.'
  },
  {
    id: 'android-host',
    tier: 'host-adapter',
    host: 'android',
    paths: ['android/'],
    role: 'Android native host project and platform resources.'
  },
  {
    id: 'ios-host',
    tier: 'host-adapter',
    host: 'ios',
    paths: ['ios/'],
    role: 'Future iOS native host project and platform resources.'
  }
];

export const PRODUCTION_SCAN_DIRS = TOPOLOGY_UNITS.flatMap((unit) =>
  unit.paths.map((unitPath) => unitPath.replace(/\/$/, ''))
);

export const RUNTIME_COMMAND_BOUNDARY_DIRS = [
  'src/app/',
  'src/companion/',
  'src/web-guides/',
  'src/store/',
  'src/features/',
  'src/shared/diagnostics/'
];

export const HOST_ISOLATION_RULES = [
  {
    from: [
      'desktop-renderer',
      'mobile-renderer',
      'web-guides-renderer',
      'renderer-business',
      'runtime-adapter',
      'core',
      'platform-contract'
    ],
    forbiddenPrefixes: ['electron/', 'android/', 'ios/'],
    kind: 'host-adapter-import'
  },
  {
    from: ['web-guides-renderer'],
    forbiddenPrefixes: ['src/app/', 'src/companion/'],
    kind: 'renderer-shell-import'
  },
  {
    from: ['electron-host'],
    forbiddenPrefixes: ['android/', 'ios/', 'src/app/', 'src/companion/', 'src/web-guides/', 'src/features/', 'src/store/'],
    kind: 'host-isolation-import'
  },
  {
    from: ['android-host'],
    forbiddenPrefixes: ['electron/', 'ios/', 'src/app/', 'src/companion/', 'src/web-guides/', 'src/features/', 'src/store/'],
    kind: 'host-isolation-import'
  },
  {
    from: ['ios-host'],
    forbiddenPrefixes: ['electron/', 'android/', 'src/app/', 'src/companion/', 'src/web-guides/', 'src/features/', 'src/store/'],
    kind: 'host-isolation-import'
  }
];

export function resolveTopologyUnit(relativeFile) {
  const normalizedFile = relativeFile.replace(/\\/g, '/');
  return TOPOLOGY_UNITS.find((unit) => unit.paths.some((unitPath) => normalizedFile.startsWith(unitPath))) ?? null;
}
