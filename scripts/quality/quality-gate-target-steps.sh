run_renderer_guards_if_present() {
  [[ ! -f "scripts/check-ui-copy-guard.mjs" ]] || run_quality_gate_script "${prefix}" "${pm}" "copy:guard"
  [[ ! -f "scripts/check-native-dialog-guard.mjs" ]] || run_quality_gate_script "${prefix}" "${pm}" "native-dialog:guard"
}

run_release_core_gate_steps() {
  run_release_static_gate_steps
  run_release_test_gate_steps
  run_release_build_gate_steps
}

run_release_hosted_common_gate_steps() {
  run_release_static_gate_steps
  run_release_hosted_common_test_gate_steps
  run_release_build_gate_steps
}

run_release_target_steps() {
  case "$1" in
    release-core) run_release_core_gate_steps ;;
    release-hosted-common) run_release_hosted_common_gate_steps ;;
    release-hosted-common-build) run_release_hosted_common_build_gate_steps ;;
    release-windows-core) run_gate_steps test:windows:core ;;
    release-static) run_release_static_gate_steps ;;
    release-tests) run_release_test_gate_steps ;;
    release-build) run_release_build_gate_steps ;;
    release-script-preview) run_release_script_preview_gate_steps ;;
    release-base) run_release_core_gate_steps ;;
    release-windows-tail) run_release_preview_recovery_gate_steps ;;
    release-android-tail) run_release_android_host_gate_steps ;;
    release-ios-tail) run_gate_steps quality:ios ;;
    release-tooling) run_release_tooling_gate_steps ;;
    release-preview-recovery) run_release_preview_recovery_gate_steps ;;
    release-android-host) run_release_android_host_gate_steps ;;
    full) run_release_core_gate_steps; run_release_preview_recovery_gate_steps ;;
    release) run_release_core_gate_steps; run_release_preview_recovery_gate_steps; run_release_android_host_gate_steps ;;
  esac
}

run_release_static_gate_steps() {
  run_renderer_guards_if_present
  run_repository_root_boundary_check_if_present
  run_gate_steps check:android-boundary
  run_gate_steps_parallel lint:full typecheck:desktop typecheck:android
}

quality_gate_integration_scripts() {
  QUALITY_GATE_BUCKET_SELECTION_PATH="${QUALITY_GATE_LIB_DIR}/../script-test-bucket-selection.mjs" node --input-type=module -e "import('node:url').then(({ pathToFileURL }) => import(pathToFileURL(process.env.QUALITY_GATE_BUCKET_SELECTION_PATH).href)).then((m) => console.log(m.GATE_INTEGRATION_SCRIPT_NAMES.join(' ')))"
}

quality_gate_integration_shard_scripts() {
  QUALITY_GATE_BUCKET_SELECTION_PATH="${QUALITY_GATE_LIB_DIR}/../script-test-bucket-selection.mjs" QUALITY_TOOLING_SHARD="$1" node --input-type=module -e "import('node:url').then(({ pathToFileURL }) => import(pathToFileURL(process.env.QUALITY_GATE_BUCKET_SELECTION_PATH).href)).then((m) => console.log(m.selectGateIntegrationScriptNames(process.env.QUALITY_TOOLING_SHARD).join(' ')))"
}

quality_script_self_tests_changed_files_match() {
  local changed="$1"
  printf '%s\n' "${changed}" | node "${QUALITY_GATE_LIB_DIR}/../script-test-bucket-selection.mjs" changed-files-need-script-tests
}

run_quality_script_gate_steps_if_related() {
  local changed="$1"
  if quality_script_self_tests_changed_files_match "${changed}"; then
    run_quality_script_gate_steps
  elif quality_gate_should_print_step; then
    echo "[${prefix}] skipped quality script self-tests: changed files do not touch script test roots"
  fi
}

run_release_test_gate_steps() {
  run_gate_steps_parallel test:release:desktop-src test:windows:core test:release:android test:release:shared test:quality:core test:quality:gate test:quality:node
  run_gate_steps test:desktop:electron
  run_gate_steps $(quality_gate_integration_scripts)
}

run_release_hosted_common_test_gate_steps() {
  run_gate_steps_parallel test:release:desktop-src test:release:android test:release:shared test:quality:core test:quality:gate test:quality:node
  run_gate_steps test:desktop:electron
  run_gate_steps $(quality_gate_integration_scripts)
}

run_quality_script_gate_steps() {
  run_gate_steps_parallel test:quality:core test:quality:gate $(quality_gate_integration_scripts) test:quality:node
  run_gate_steps test:quality:preview
}

run_quality_script_gate_steps_sequential() {
  run_gate_steps test:quality:core test:quality:gate $(quality_gate_integration_scripts) test:quality:node test:quality:preview
}

run_shared_static_gate_steps() {
  run_renderer_guards_if_present
  run_repository_root_boundary_check_if_present
  run_gate_steps check:android-boundary lint:shared:full typecheck:shared
}

run_shared_test_gate_steps() {
  run_gate_steps test:shared
}

run_shared_quality_test_gate_steps() {
  run_quality_script_gate_steps_sequential
}

run_shared_build_gate_steps() {
  run_gate_steps build electron:compile android:web:build
  run_workspace_boundary_check_if_present
}

run_release_build_gate_steps() {
  run_gate_steps test:quality:preview
  run_gate_steps_parallel build:vite-only electron:compile android:web:build
  run_workspace_boundary_check_if_present
}

run_release_hosted_common_build_gate_steps() {
  run_gate_steps_parallel build:vite-only electron:compile android:web:build
  run_workspace_boundary_check_if_present
}

run_release_script_preview_gate_steps() {
  run_gate_steps test:quality:preview
}

run_quality_tooling_file_shard() {
  local bucket="$1"
  run_quality_gate_command \
    "${prefix}" \
    "test:quality:${bucket}" \
    "test:quality:${bucket}" \
    node scripts/electron-sqlite-runner.mjs scripts/run-script-test-bucket.mjs \
    "${bucket}" ".tmp/vitest/quality-${bucket}.json"
}

run_release_tooling_gate_steps() {
  local segment="${FOLIOLE_QUALITY_TOOLING_SEGMENT:-full}"
  case "${segment}" in
    full) run_quality_script_gate_steps ;;
    core-one|core-two|gate-one|gate-two) run_quality_tooling_file_shard "${segment}" ;;
    integration-one|integration-two)
      run_gate_steps_parallel $(quality_gate_integration_shard_scripts "${segment}")
      ;;
    node-preview) run_gate_steps_parallel test:quality:node test:quality:preview ;;
    *) echo "[${prefix}] unknown quality tooling segment: ${segment}"; return 1 ;;
  esac
}

run_release_preview_recovery_gate_steps() {
  run_gate_steps test:windows:native-preview
}

run_release_android_host_gate_steps() {
  run_gate_steps android:sync android:host:lint android:host:test
}
