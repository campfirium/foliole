const WINDOWS_LIBRARY_PATH_POLICY_FILES = [
  /^package\.json$/u,
  /^scripts\/windows\/.*\.(?:cmd|bat|mjs|ps1|sh)$/u
];

const WINDOWS_LIBRARY_PATH_POLICY_PATTERNS = [
  {
    pattern: /FOLIOLE_USE_NATIVE_DEBUG_LIBRARY_COPY\s*!==\s*['"]0['"]/u,
    reason: 'do not make the native debug library copy the default Windows preview database'
  },
  {
    pattern: /library_home\s*:\s*debugLibraryHome/u,
    reason: 'do not persist the native debug library as Library Home'
  },
  {
    pattern: /(?:library-path-settings\.json[\s\S]*native-debug-library|native-debug-library[\s\S]*library-path-settings\.json)/u,
    reason: 'do not wire native-debug-library into persisted library path settings'
  }
];

export function runWindowsLibraryPathPolicyGuard(files, readStagedAddedLines) {
  const violations = [];
  for (const file of files.filter(shouldCheckFile)) {
    const content = readStagedAddedLines(file);
    for (const { pattern, reason } of WINDOWS_LIBRARY_PATH_POLICY_PATTERNS) {
      if (pattern.test(content)) {
        violations.push(`${file}: ${reason}`);
      }
    }
  }
  if (violations.length === 0) {
    return;
  }
  throw new Error([
    'windows library path policy violation: preview scripts must not silently swap or persist the user library.',
    ...violations
  ].join('\n'));
}

function shouldCheckFile(file) {
  return WINDOWS_LIBRARY_PATH_POLICY_FILES.some((pattern) => pattern.test(file));
}
