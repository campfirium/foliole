import {
  AGENT_CLI_CONTRACT_VERSION,
  AGENT_CLI_ROUTES,
  createAgentCliHelp
} from './foliole-agent-routes.mjs';

const GROUP_LABELS = {
  materials: 'Topics, Folders, and Items',
  'virtual-folders': 'Virtual Folders'
};

const FLAG_DESCRIPTIONS = {
  content: 'Topic content or Item question. Pass an empty value with --content= to clear Topic content.',
  'expected-updated-at': 'The updated_at value returned by the latest read.',
  'folder-id': 'Virtual Folder ID.',
  id: 'Topic, Folder, or Item ID.',
  kind: 'Type to create: topic, folder, or item.',
  limit: 'Maximum number of results to return.',
  'material-ids': 'Comma-separated Topic or Folder IDs in the requested order.',
  'parent-id': 'Parent ID, or root for the workspace root; root means Inbox for Items.',
  query: 'Search text.',
  reveal: 'Item answer, limited to 4,000 characters.',
  title: 'Topic or Folder title, or an explicit Item title update.'
};

const COMMON_OPTIONS = [
  { description: 'Show help without connecting to Foliole.', name: '--help, -h' },
  { description: 'Override the current Agent Control session descriptor path.', name: '--descriptor <path>' },
  { description: 'Override the automatic backup directory for a write command.', name: '--backup-dir <path>', writeOnly: true }
];

const EXIT_CODES = [
  { code: 0, meaning: 'Success.' },
  { code: 1, meaning: 'Foliole rejected the request.' },
  { code: 2, meaning: 'Invalid command or arguments.' },
  { code: 3, meaning: 'Foliole session or capability unavailable.' },
  { code: 4, meaning: 'The required safety backup could not be created.' }
];

const COMMAND_DETAILS = {
  'materials/create': details(
    [
      'Creates a local backup record before writing.',
      'Topic and Folder require --title. Item requires --content and --reveal and does not accept --title.'
    ],
    [
      'foliole materials/create --kind topic --title "Reading topic" --content "Body" --parent-id root',
      'foliole materials/create --kind item --content "Question" --reveal "Answer" --parent-id root'
    ]
  ),
  'materials/delete-soft': details([
    'Moves the Topic or Folder to trash; it does not permanently delete it.',
    'If --expected-updated-at is omitted, the CLI reads the latest value before writing.'
  ]),
  'materials/move': guardedWrite('Run materials/read first and pass its updated_at value.'),
  'materials/reorder': details([
    'Replaces the complete direct-child order for the selected Folder or workspace root.',
    'Pass every current direct child ID exactly once; the request conflicts otherwise.'
  ]),
  'materials/restore': guardedWrite('Use the updated_at value returned for the trashed material.'),
  'materials/update': details([
    'Updates only the supplied title, content, or Item answer; it does not change Folder membership or ordering.',
    'Run materials/read first and pass the latest materials/read updated_at value. The CLI backs up the current Topic or Item before writing.'
  ], [
    'foliole materials/update --id <id> --expected-updated-at <updated_at> --title "New title"'
  ]),
  'virtual-folders/add-items': details([
    'Adds the supplied Topics without removing existing Topics from the virtual Folder.'
  ]),
  'virtual-folders/create': details(['Creates a local backup record before writing.']),
  'virtual-folders/delete-soft': guardedWrite('Moves the virtual Folder to trash; it does not permanently delete it.'),
  'virtual-folders/remove-items': details([
    'Removes only the supplied Topics; other Topics remain in the virtual Folder.'
  ]),
  'virtual-folders/reorder': details([
    'Replaces the order of the currently visible Topics in the virtual Folder.',
    'Pass every currently visible Topic ID exactly once; the request conflicts otherwise.'
  ]),
  'virtual-folders/restore': guardedWrite('Use the updated_at value returned for the trashed virtual Folder.'),
  'virtual-folders/update': guardedWrite('Renames the virtual Folder without changing its Topics.')
};

export function resolveAgentCliHelp(argv) {
  if (argv.length === 0) return helpResult(null, false);
  const hasHelpFlag = argv.includes('--help') || argv.includes('-h');
  if (argv[0] !== 'help' && !hasHelpFlag) return null;
  const json = argv.includes('--json');
  if (argv[0] !== 'help') {
    const [topic] = normalizeAgentCliCommand(argv);
    return helpResult(topic?.startsWith('-') ? null : topic, json);
  }
  const topics = argv.filter((token, index) => (
    token !== '--help' && token !== '-h' && token !== '--json' && !(index === 0 && token === 'help')
  ));
  if (topics.length > 2) return invalidHelp();
  const topic = normalizeHelpTopic(topics);
  return topic === undefined ? invalidHelp() : helpResult(topic, json);
}

export function normalizeAgentCliCommand(argv) {
  const [first, second, ...rest] = argv;
  if (!first || first.startsWith('-') || !second || second.startsWith('-')) return argv;
  const joined = `${first}/${second}`;
  return AGENT_CLI_ROUTES[joined] ? [joined, ...rest] : argv;
}

function helpResult(topic, json) {
  if (topic && !AGENT_CLI_ROUTES[topic] && !GROUP_LABELS[topic]) {
    return { output: { error: 'unknown_help_topic', topic }, status: 2 };
  }
  const document = createHelpDocument(topic);
  return { output: json ? document : formatHelp(document), status: 0 };
}

function createHelpDocument(topic) {
  if (topic && AGENT_CLI_ROUTES[topic]) return commandDocument(topic, AGENT_CLI_ROUTES[topic]);
  const commands = Object.entries(AGENT_CLI_ROUTES)
    .filter(([name]) => !topic || name.startsWith(`${topic}/`))
    .map(([name, route]) => commandDocument(name, route));
  if (topic) return { commands, group: topic, name: 'foliole', title: GROUP_LABELS[topic], version: AGENT_CLI_CONTRACT_VERSION };
  return {
    ...createAgentCliHelp(),
    commands,
    exit_codes: EXIT_CODES,
    requirements: [
      'Keep the Foliole desktop app running for commands other than help and --version.',
      'Command results and errors are written as one JSON line.'
    ],
    usage: [
      'foliole <command> [options]',
      'foliole <group> <command> [options]',
      'foliole help [group] [command] [--json]',
      'foliole --version'
    ]
  };
}

function commandDocument(name, route) {
  const detail = COMMAND_DETAILS[name] ?? (route.writeKind ? guardedWrite() : details());
  const flags = (access) => route.args[access].map((flag) => ({
    description: FLAG_DESCRIPTIONS[flag] ?? '',
    name: `--${flag}`
  }));
  return {
    access: route.writeKind ? 'write' : 'read',
    aliases: name.includes('/') ? [name.replace('/', ' ')] : [],
    arguments: route.args,
    description: route.description,
    examples: detail.examples,
    name,
    notes: detail.notes,
    options: { optional: flags('optional'), required: flags('required') },
    common_options: COMMON_OPTIONS.filter((option) => !option.writeOnly || route.writeKind)
      .map((option) => ({ description: option.description, name: option.name })),
    usage: commandUsage(name, route.args)
  };
}

function commandUsage(name, args) {
  const flags = [
    ...args.required.map((flag) => `--${flag} <value>`),
    ...args.optional.map((flag) => `[--${flag} <value>]`)
  ];
  return `foliole ${name} ${flags.join(' ')}`.trim();
}

function formatHelp(document) {
  if (!document.commands) return formatCommandHelp(document);
  const heading = document.group ? `Foliole ${document.title}` : 'Foliole CLI';
  const lines = [heading, ''];
  if (!document.group) {
    lines.push('Read and update the local Foliole workspace.', '', 'Usage:', ...document.usage.map((item) => `  ${item}`), '');
  }
  lines.push('Commands:');
  for (const command of document.commands) {
    lines.push(`  ${command.name.padEnd(30)} ${command.description}`);
  }
  if (!document.group) {
    lines.push(
      '', ...document.requirements,
      '', 'Exit codes:', ...document.exit_codes.map((item) => `  ${item.code}  ${item.meaning}`),
      '', 'Run `foliole <command> --help` for command details.'
    );
  }
  return lines.join('\n');
}

function formatCommandHelp(command) {
  const lines = [command.description, '', 'Usage:', `  ${command.usage}`, `Access: ${command.access}`];
  appendFlags(lines, 'Required options', command.options.required);
  appendFlags(lines, 'Optional options', command.options.optional);
  appendFlags(lines, 'Common options', command.common_options);
  if (command.notes.length) lines.push('', 'Notes:', ...command.notes.map((note) => `  - ${note}`));
  if (command.examples.length) lines.push('', 'Examples:', ...command.examples.map((example) => `  ${example}`));
  return lines.join('\n');
}

function appendFlags(lines, heading, flags) {
  if (!flags.length) return;
  lines.push('', `${heading}:`);
  for (const flag of flags) lines.push(`  ${flag.name.padEnd(24)} ${flag.description}`.trimEnd());
}

function normalizeHelpTopic(topics) {
  if (topics.length === 0) return null;
  if (topics.length === 1) return topics[0];
  const joined = `${topics[0]}/${topics[1]}`;
  return AGENT_CLI_ROUTES[joined] ? joined : undefined;
}

function details(notes = [], examples = []) {
  return { examples, notes };
}

function guardedWrite(note = 'Creates a local backup before writing.') {
  return details([note, 'Use the latest read result to avoid overwriting a concurrent change.']);
}

function invalidHelp() {
  return { output: { error: 'invalid_help_arguments' }, status: 2 };
}
