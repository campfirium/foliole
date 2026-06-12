#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

NPM_HARDENING_NETWORK_TIMEOUT_SECONDS="${NPM_HARDENING_NETWORK_TIMEOUT_SECONDS:-45}"

echo "[npm-hardening] checking repository dependency guardrails"

save_exact="$(npm config get save-exact)"
if [[ "${save_exact}" != "true" ]]; then
  echo "[npm-hardening] save-exact is not enabled"
  exit 1
fi
echo "[npm-hardening] ok: save-exact=true"

if grep -q 'npm install -g' scripts/codex/run-task.sh scripts/codex/run-loop.sh; then
  echo "[npm-hardening] codex shell wrappers still contain automatic global install"
  exit 1
fi
echo "[npm-hardening] ok: codex shell wrappers do not auto-install global packages"

audit_cache_dir=".tmp/npm-audit-cache"
audit_json_file=".tmp/npm-audit-report.json"
mkdir -p "${audit_cache_dir}"
set +e
timeout "${NPM_HARDENING_NETWORK_TIMEOUT_SECONDS}s" npm audit --omit=dev --json --cache "${audit_cache_dir}" > "${audit_json_file}"
audit_exit=$?
set -e
if [[ "${audit_exit}" -gt 1 ]]; then
  if [[ "${audit_exit}" -eq 124 ]]; then
    echo "[npm-hardening] npm audit timed out after ${NPM_HARDENING_NETWORK_TIMEOUT_SECONDS}s"
    exit "${audit_exit}"
  fi
  echo "[npm-hardening] npm audit failed unexpectedly"
  cat "${audit_json_file}"
  exit "${audit_exit}"
fi
node -e "
  const fs = require('node:fs');
  const report = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
  if (report.error) {
    console.error('[npm-hardening] runtime audit unavailable: ' + (report.message || report.error.summary || 'unknown audit error'));
    process.exit(1);
  }
  const stats = report.metadata?.vulnerabilities ?? {};
  const total = stats.total ?? 0;
  const high = stats.high ?? 0;
  const critical = stats.critical ?? 0;
  const prod = report.metadata?.dependencies?.prod ?? 'unknown';
  if (high > 0 || critical > 0) {
    console.error('[npm-hardening] runtime audit found high/critical vulnerabilities');
    process.exit(1);
  }
  console.log('[npm-hardening] ok: runtime audit clean (prod=' + prod + ', total=' + total + ')');
" "${audit_json_file}"

echo "[npm-hardening] running dependency scan"
npm run deps:scan
echo "[npm-hardening] ok: dependency scan clean"

if ! grep -Eq '^min-release-age=7$' .npmrc; then
  echo "[npm-hardening] .npmrc must contain min-release-age=7"
  exit 1
fi
echo "[npm-hardening] ok: .npmrc pins min-release-age=7"

versions_json_file=".tmp/npm-time.json"
timeout "${NPM_HARDENING_NETWORK_TIMEOUT_SECONDS}s" npm view npm time --json > "${versions_json_file}"

mapfile -t selected_versions < <(
  node -e "
    const fs = require('node:fs');
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const timeMap = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const versions = Object.entries(timeMap)
      .filter(([version, publishedAt]) => /^\\d+\\.\\d+\\.\\d+$/.test(version) && typeof publishedAt === 'string')
      .map(([version, publishedAt]) => ({ version, publishedAt: new Date(publishedAt).getTime() }))
      .filter(({ publishedAt }) => Number.isFinite(publishedAt))
      .sort((a, b) => b.publishedAt - a.publishedAt);
    const recent = versions.find(({ publishedAt }) => now - publishedAt < sevenDaysMs);
    const mature = versions.find(({ publishedAt }) => now - publishedAt >= sevenDaysMs);
    if (recent) console.log('recent=' + recent.version);
    if (mature) console.log('mature=' + mature.version);
  " "${versions_json_file}"
)

recent_version=""
mature_version=""
for item in "${selected_versions[@]}"; do
  case "${item}" in
    recent=*)
      recent_version="${item#recent=}"
      ;;
    mature=*)
      mature_version="${item#mature=}"
      ;;
  esac
done

probe_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${probe_dir}"
}
trap cleanup EXIT
printf '{\n  "name": "npm-hardening-probe",\n  "private": true\n}\n' > "${probe_dir}/package.json"
printf 'min-release-age=7\n' > "${probe_dir}/.npmrc"

if [[ -n "${recent_version}" ]]; then
  set +e
  (cd "${probe_dir}" && timeout "${NPM_HARDENING_NETWORK_TIMEOUT_SECONDS}s" npm install "npm@${recent_version}" --package-lock-only > recent.log 2>&1)
  recent_exit=$?
  set -e
  if [[ "${recent_exit}" -eq 0 ]]; then
    echo "[npm-hardening] min-release-age did not block recent npm@${recent_version}"
    cat "${probe_dir}/recent.log"
    exit 1
  fi
  echo "[npm-hardening] ok: min-release-age blocked recent npm@${recent_version}"
else
  echo "[npm-hardening] warning: no npm release newer than 7 days was found; skipped block probe"
fi

if [[ -z "${mature_version}" ]]; then
  echo "[npm-hardening] could not find an npm version older than 7 days for allow probe"
  exit 1
fi

(cd "${probe_dir}" && timeout "${NPM_HARDENING_NETWORK_TIMEOUT_SECONDS}s" npm install "npm@${mature_version}" --package-lock-only > mature.log 2>&1)
echo "[npm-hardening] ok: min-release-age allowed mature npm@${mature_version}"
echo "[npm-hardening] all dependency guardrails passed"
