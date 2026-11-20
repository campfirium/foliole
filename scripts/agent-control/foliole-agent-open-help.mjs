export function createOpenCommandHelp() {
  return {
    access: 'local',
    aliases: [],
    arguments: { optional: [], required: [] },
    common_options: [],
    description: 'Start the Foliole desktop app if it is not running, then wait until Agent Control is available.',
    examples: ['foliole open && foliole materials/search --query "notes"'],
    name: 'open',
    notes: [
      'Returns {"status":"running"} without changes when Agent Control is already available.',
      'Returns {"status":"started"} after the app this CLI was installed with starts and Agent Control is ready.',
      'On Windows, run it from the signed-in desktop session; non-interactive sessions such as SSH are rejected.'
    ],
    options: { optional: [], required: [] },
    usage: 'foliole open'
  };
}
