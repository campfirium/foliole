#!/usr/bin/env bash

WINDOWS_NATIVE_PREFLIGHT_STAMP_FILE="${WINDOWS_NATIVE_PREFLIGHT_STAMP_FILE:-.lab/internal/runtime/windows-native-preflight.json}"

windows_native_preflight_fingerprint() {
  node -e '
const crypto = require("node:crypto");
const fs = require("node:fs");
const files = ["package.json", "package-lock.json"];
const hash = crypto.createHash("sha256");
const envKeys = ["WINDOWS_NATIVE_ABI_CHECK_COMMAND", "WINDOWS_NODE_MODULES_CHECK_COMMAND"];
for (const file of files) {
  hash.update(file);
  hash.update("\0");
  if (fs.existsSync(file)) {
    hash.update(fs.readFileSync(file));
  }
  hash.update("\0");
}
for (const key of envKeys) {
  hash.update(key);
  hash.update("\0");
  hash.update(process.env[key] ?? "");
  hash.update("\0");
}
process.stdout.write(hash.digest("hex"));
'
}

windows_native_preflight_stamp_matches() {
  local fingerprint="$1"
  local stamp_file="${WINDOWS_NATIVE_PREFLIGHT_STAMP_FILE}"
  if [ ! -f "${stamp_file}" ]; then
    return 1
  fi
  node -e '
const fs = require("node:fs");
const filePath = process.argv[1];
const fingerprint = process.argv[2];
const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
process.exit(payload.fingerprint === fingerprint && payload.nodeModules === "passed" && payload.nativeAbi === "passed" ? 0 : 1);
' "${stamp_file}" "${fingerprint}" 2>/dev/null
}

write_windows_native_preflight_stamp() {
  local fingerprint="$1"
  local stamp_file="${WINDOWS_NATIVE_PREFLIGHT_STAMP_FILE}"
  mkdir -p "$(dirname "${stamp_file}")"
  node -e '
const fs = require("node:fs");
const filePath = process.argv[1];
const fingerprint = process.argv[2];
fs.writeFileSync(filePath, JSON.stringify({
  checkedAt: new Date().toISOString(),
  fingerprint,
  nativeAbi: "passed",
  nodeModules: "passed",
  schemaVersion: 1
}, null, 2) + "\n");
' "${stamp_file}" "${fingerprint}"
}

run_windows_native_preflight_if_needed() {
  local fingerprint=""
  fingerprint="$(windows_native_preflight_fingerprint)"
  if [ "${WINDOWS_PREVIEW_FORCE_PREFLIGHT:-}" != "1" ] && windows_native_preflight_stamp_matches "${fingerprint}"; then
    echo "[windows-preview] windows dependency/native preflight skipped"
    return 0
  fi

  echo "[windows-preview] windows dependency/native preflight required"
  verify_windows_node_modules
  verify_windows_native_abi
  write_windows_native_preflight_stamp "${fingerprint}"
}
