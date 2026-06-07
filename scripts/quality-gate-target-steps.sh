run_renderer_guards_if_present() {
  [[ ! -f "scripts/check-ui-copy-guard.mjs" ]] || run_quality_gate_script "${prefix}" "${pm}" "copy:guard"
  [[ ! -f "scripts/check-native-dialog-guard.mjs" ]] || run_quality_gate_script "${prefix}" "${pm}" "native-dialog:guard"
}

run_release_core_gate_steps() {
  run_release_static_gate_steps
  run_release_test_gate_steps
  run_release_build_gate_steps
}

run_release_target_steps() {
  case "$1" in
    release-core) run_release_core_gate_steps ;;
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

run_release_test_gate_steps() {
  run_gate_steps_parallel test:desktop:src test:desktop:electron test:windows:core test:android test:shared test:sync-pack test:quality:core test:quality:gate test:quality:node
}

run_release_build_gate_steps() {
  run_gate_steps test:quality:preview
  run_gate_steps_parallel build electron:compile android:web:build
  run_workspace_boundary_check_if_present
}

run_release_script_preview_gate_steps() {
  run_gate_steps test:quality:preview
}

run_release_tooling_gate_steps() {
  run_gate_steps_parallel test:quality:core test:quality:gate test:quality:node
  run_gate_steps test:quality:preview
}

run_release_preview_recovery_gate_steps() {
  run_gate_steps test:windows:preview-recovery
}

run_release_android_host_gate_steps() {
  run_gate_steps android:sync android:host:lint android:host:test
}
