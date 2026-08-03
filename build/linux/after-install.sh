#!/bin/bash
set -eu

ln -sfn '/opt/Foliole/bin/foliole' '/usr/bin/foliole'

if [[ -L /proc/self/ns/user ]] && unshare --user true; then
  chmod 0755 '/opt/Foliole/chrome-sandbox'
else
  chmod 4755 '/opt/Foliole/chrome-sandbox'
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database /usr/share/applications || true
fi

if apparmor_status --enabled >/dev/null 2>&1; then
  profile_source='/opt/Foliole/resources/apparmor-profile'
  profile_target='/etc/apparmor.d/foliole'
  apparmor_parser --skip-kernel-load --debug "$profile_source" >/dev/null
  cp -f "$profile_source" "$profile_target"
  if ! { [[ -x /usr/bin/ischroot ]] && /usr/bin/ischroot; }; then
    apparmor_parser --replace --write-cache --skip-read-cache "$profile_target"
  fi
fi
