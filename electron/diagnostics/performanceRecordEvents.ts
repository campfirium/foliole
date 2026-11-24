// Rate-limited performance records kept at info level, so they never crowd the error summary of a diagnostic report.
export const PERFORMANCE_RECORD_EVENTS: ReadonlySet<string> = new Set([
  'native_command_slow', 'native_command_hot', 'renderer_long_task', 'renderer_long_tasks',
  'node_switch_slow'
]);
