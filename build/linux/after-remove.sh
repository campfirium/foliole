#!/bin/bash
set -eu

if [[ -L /usr/bin/foliole ]] && [[ "$(readlink /usr/bin/foliole)" == '/opt/Foliole/bin/foliole' ]]; then
  rm -f '/usr/bin/foliole'
fi

if [[ -L /usr/bin/foliole-global-clip ]] && \
  [[ "$(readlink /usr/bin/foliole-global-clip)" == '/opt/Foliole/bin/foliole-global-clip' ]]; then
  rm -f '/usr/bin/foliole-global-clip'
fi

profile_target='/etc/apparmor.d/foliole'
if [[ -f "$profile_target" ]]; then
  if apparmor_status --enabled >/dev/null 2>&1 && \
    ! { [[ -x /usr/bin/ischroot ]] && /usr/bin/ischroot; }; then
    apparmor_parser --remove "$profile_target" || true
  fi
  rm -f "$profile_target"
fi
