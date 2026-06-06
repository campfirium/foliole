run_renderer_guards_if_present() {
  [[ ! -f "scripts/check-ui-copy-guard.mjs" ]] || run_quality_gate_script "${prefix}" "${pm}" "copy:guard"
  [[ ! -f "scripts/check-native-dialog-guard.mjs" ]] || run_quality_gate_script "${prefix}" "${pm}" "native-dialog:guard"
}

run_release_core_gate_steps() {
  run_renderer_guards_if_present
  run_repository_root_boundary_check_if_present
  run_gate_steps check:android-boundary
  run_gate_steps_parallel lint:full typecheck:desktop typecheck:android
  run_gate_steps_parallel test:desktop:src test:desktop:electron test:windows:core test:android test:shared test:sync-pack test:quality:core test:quality:gate test:quality:node
  run_gate_steps test:quality:preview
  run_gate_steps_parallel build electron:compile android:web:build
  run_workspace_boundary_check_if_present
}

run_release_preview_recovery_gate_steps() {
  run_gate_steps test:windows:preview-recovery
}

run_release_android_host_gate_steps() {
  run_gate_steps android:sync android:host:lint android:host:test
}
