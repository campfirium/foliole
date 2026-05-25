import { REPO_ROOT } from './todo-ledger.mjs';

const TASK_SKILL_DIRECTIVE = /^\[skills?:\s*([^\]]+)\]\s*/i;
const EXPLICIT_SKILL_RULES = [
  { skill: 'build-sync', patterns: [/执行构建并同步指令/, /build and sync/i] },
  { skill: 'sync-only', patterns: [/执行同步指令/, /sync only/i] },
  { skill: 'commit-note', patterns: [/执行提交指令/, /(?:^|\s)(?:提交|commit)(?:$|\s)/i] },
  { skill: 'session-handoff', patterns: [/^(继续|continue)$/i, /(?:handoff|交接|继续到下次|continue later)/i] },
  { skill: 'impl-task', patterns: [/执行实施任务指令/] },
  { skill: 'merge-sop', patterns: [/执行合并分支指令/] },
  { skill: 'obsidian-release', patterns: [/执行发布指令/] },
  { skill: 'web-design-guidelines', patterns: [/执行设计指南指令/] }
];

export function parseTaskRequest(rawTask) {
  const normalizedTask = rawTask.trim();
  const directiveMatch = normalizedTask.match(TASK_SKILL_DIRECTIVE);
  const directiveSkills = directiveMatch
    ? directiveMatch[1]
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean)
    : [];
  const task = directiveMatch ? normalizedTask.slice(directiveMatch[0].length).trim() : normalizedTask;
  const matchedSkills = EXPLICIT_SKILL_RULES.flatMap(({ skill, patterns }) =>
    patterns.some((pattern) => pattern.test(task)) ? [skill] : []
  );
  const skills = [...new Set([...directiveSkills, ...matchedSkills])];

  return { skills, task };
}

function buildConstraintLines() {
  return [
    '- Stay within the task boundary and avoid unrelated refactors.',
    '- Run minimal relevant verification before finishing.',
    '- Treat failed verification or preview startup as unfinished work: inspect the output, fix the in-scope cause, rerun the narrow check, and only finish after it passes.',
    '- Use the repository validation resource gate entrypoints for test, lint, typecheck, and preview work; do not start test/lint/typecheck in parallel with preview or with each other.',
    '- When desktop lint and Windows preview are both required, run npm run validate:desktop:serial and keep that command alive until it exits instead of launching lint:desktop and windows:preview:native separately.',
    '- If a Windows preview is required, a normal final reply is only allowed after npm run windows:preview reaches [windows-preview] status: STARTED.',
    '- If preview-dedupe says a request is waiting, keep waiting for that same preview command to finish; do not stop the waiting process or report the wait as a final result.',
    '- If required preview is blocked by an out-of-scope existing red light, do not send a normal completion report or say the preview was not run; keep the task unfinished until a later successful preview can release it.',
    '- Update .lab task ledger only if the task state changes.',
    '- Report summary, verification, root cause if applicable, and remaining risk.'
  ];
}

export function buildPrompt(task) {
  const request = parseTaskRequest(task);
  const promptLines = [
    `Work in repository: ${REPO_ROOT}`,
    'Read AGENTS.md first and follow the repo workflow in .lab/atlas/workflow.md.',
    `Implement exactly one minimal acceptable task: ${request.task}`,
    'Constraints:',
    ...buildConstraintLines()
  ];

  if (request.skills.length > 0) {
    promptLines.splice(
      2,
      0,
      'Explicit skill triggers for this task:',
      ...request.skills.map((skill) => `- Use skill: ${skill}`)
    );
  }

  return promptLines.join('\n');
}
