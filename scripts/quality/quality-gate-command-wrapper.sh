#!/usr/bin/env bash
set +e

output_file="$1"
pid_file="$2"
status_file="$3"
shift 3

"$@" >"${output_file}" 2>&1 &
command_pid=$!
printf "%s\n" "${command_pid}" >"${pid_file}"
wait "${command_pid}"
code=$?
printf "%s\n" "${code}" >"${status_file}"
exit "${code}"
