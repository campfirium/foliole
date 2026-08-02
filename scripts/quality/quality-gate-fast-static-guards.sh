#!/usr/bin/env bash

run_quality_gate_fast_t0_static_guards() {
  if [[ -f "scripts/check-specialized-surface-usage.mjs" ]]; then
    run_quality_gate_command \
      "quality-gate-fast" \
      "specialized-surface-usage" \
      "specialized surface usage" \
      node scripts/check-specialized-surface-usage.mjs
  fi

  if [[ -f "scripts/check-repository-root-boundary.mjs" ]]; then
    run_quality_gate_command \
      "quality-gate-fast" \
      "repository-root-boundary" \
      "repository root boundary" \
      node scripts/check-repository-root-boundary.mjs
  fi
}

run_quality_gate_fast_global_static_guards() {
  run_quality_gate_script "quality-gate-fast" "${pm}" "deps:scan"

  if [[ -f "scripts/check-native-command-contracts.mjs" ]]; then
    run_quality_gate_script "quality-gate-fast" "${pm}" "check:native-contracts"
  fi

  if [[ -f "scripts/check-layer-dependency-boundary.mjs" ]]; then
    run_quality_gate_command \
      "quality-gate-fast" \
      "layer-dependency-boundary" \
      "layer dependency boundary" \
      node scripts/check-layer-dependency-boundary.mjs
  fi
}

run_quality_gate_fast_light_mid_static_guards() {
  if [[ -f "scripts/check-ui-copy-guard.mjs" ]]; then
    run_quality_gate_script "quality-gate-fast" "${pm}" "copy:guard"
  fi

  if [[ -f "scripts/check-native-dialog-guard.mjs" ]]; then
    run_quality_gate_script "quality-gate-fast" "${pm}" "native-dialog:guard"
  fi

  if [[ -f "scripts/check-windows-console-policy.mjs" ]]; then
    run_quality_gate_script "quality-gate-fast" "${pm}" "windows:console:guard"
  fi
}
