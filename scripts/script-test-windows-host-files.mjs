import path from 'node:path';

// Script self-tests that still run on Windows hosts. Each subject either runs on
// Windows (hosted runners, Windows quality fast, Windows preview, Windows release)
// or carries win32 path, shell, or process branches that only Windows can exercise.
// Every other script self-test stays covered by the Ubuntu full bucket.
const WINDOWS_HOST_SCRIPT_TESTS = new Set([
  // Hosted runner chain used by every Windows job.
  'scripts/electron-sqlite-runner.test.mjs',
  'scripts/quality/hosted-electron-sqlite-preflight.test.mjs',
  'scripts/quality/hosted-npm-ci.test.mjs',
  'scripts/quality/hosted-quality-bucket.test.mjs',
  'scripts/quality/pinned-npm.test.mjs',
  'scripts/run-desktop-electron-test-bucket.test.mjs',
  'scripts/run-release-desktop-source-test-bucket.test.mjs',
  'scripts/run-script-test-bucket.test.mjs',
  'scripts/run-shared-test-bucket.test.mjs',
  'scripts/run-vitest-with-summary.test.mjs',
  'scripts/run-windows-test-bucket.test.mjs',
  'scripts/script-test-bucket-selection.test.mjs',
  'scripts/vitest-report-contract.test.mjs',
  // Bash quality gate targets and routing that Windows runs under Git Bash.
  'scripts/quality/quality-gate-hosted-targets.test.mjs',
  'scripts/quality/quality-gate-lib.test.mjs',
  'scripts/quality/quality-gate-process-wait-status.test.mjs',
  'scripts/quality/quality-gate-target.test.mjs',
  'scripts/quality/quality-gate-target-failures.test.mjs',
  'scripts/quality/quality-gate-critical-routes.integration.test.mjs',
  'scripts/quality/quality-gate-fast-lib-routing.test.mjs',
  'scripts/quality/quality-gate-fast-light-related.test.mjs',
  'scripts/quality/quality-gate-fast.routing.test.mjs',
  'scripts/quality/quality-gate-route-json.test.mjs',
  // Windows quality fast and its local guard steps.
  'scripts/check-layer-dependency-boundary.platform-subdomains.test.mjs',
  'scripts/check-layer-dependency-boundary.runtime-exports.test.mjs',
  'scripts/check-layer-dependency-boundary.test.mjs',
  'scripts/check-layer-dependency-boundary.topology.test.mjs',
  'scripts/check-layer-dependency-boundary.workspace-layout.test.mjs',
  'scripts/check-native-dialog-guard.test.mjs',
  'scripts/check-repository-root-boundary.test.mjs',
  'scripts/check-ui-copy-guard.test.mjs',
  'scripts/check-windows-console-policy.test.mjs',
  'scripts/check-workspace-settings-boundary.test.mjs',
  'scripts/quality/quality-critical-test-routes.test.mjs',
  'scripts/quality/quality-fast-capped.test.mjs',
  'scripts/quality/quality-fast-related-tests.test.mjs',
  'scripts/quality/run-quality-fast.test.mjs',
  'scripts/test-files.test.mjs',
  // Windows desktop development and release steps.
  'scripts/desktop-update-artifact-contract.test.mjs',
  'scripts/desktop-update-compatibility-gate.integration.test.mjs',
  'scripts/desktop-update-compatibility-gate.test.mjs',
  'scripts/desktop-update-packaged-identity.test.mjs',
  'scripts/electron-dev-env.test.mjs',
  'scripts/electron-dev-server.test.mjs',
  'scripts/electron-dev.test.mjs',
  'scripts/vite-config.test.mjs',
  // Path and process tools with win32 branches.
  'scripts/check-lib-test-collection.test.mjs',
  'scripts/codex/codex-task.test.mjs',
  'scripts/codex/run-shell.test.mjs',
  'scripts/diagnostics/transient-worktree-lifecycle.test.mjs',
  'scripts/github-monitor-gh.test.mjs',
  'scripts/install-git-hooks.test.mjs',
  'scripts/lib/path-domains.test.mjs',
  'scripts/lib/script-domain-registry.test.mjs',
  'scripts/resource-gate.test.mjs',
  'scripts/run-with-timeout.test.mjs'
]);

export function listWindowsHostScriptTests() {
  return [...WINDOWS_HOST_SCRIPT_TESTS].sort();
}

export function isWindowsHostScriptTest(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  // Windows preview runs through preview-dedupe, so its whole suite stays on Windows.
  return WINDOWS_HOST_SCRIPT_TESTS.has(normalized) || path.basename(normalized).startsWith('preview-dedupe');
}
