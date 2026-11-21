// JVM launchers print a notice whenever JAVA_TOOL_OPTIONS or a similar variable is set,
// including the one sandboxed shells inject. Tests that require silent compilation or runs
// remove only those notices so a real diagnostic still fails them.
const JVM_OPTION_NOTICE = /^(?:NOTE: )?Picked up (?:JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|_JAVA_OPTIONS):.*(?:\r?\n|$)/gmu;

export function jvmStderr(text) {
  return typeof text === 'string' ? text.replace(JVM_OPTION_NOTICE, '') : text;
}
