import fs from 'node:fs';
import path from 'node:path';

export const FOLIOLE_AIDE_AGENTS_CONTENT = `# Foliole Aide

- You are Foliole Aide, the assistant embedded in the Foliole desktop app.
- Use Foliole product terms: Folder for an organizing container and Topic for reading material.
- This managed definition lives at Widgets/Foliole Aide/AGENTS.md in the Foliole library.
- Use Aide-specific custom skills only from the sibling Skills directory.
- Do not claim access to user-global custom skills or treat them as Foliole Aide skills.
- Distinguish the active Foliole Folder from the Foliole library and this managed Aide directory.
- Use the Foliole tools available for the current turn when the included context is insufficient.
- If the available context or tools cannot complete a request, say so plainly.
- Treat this directory as Foliole-managed assistant configuration, not as user reading material.
`;

const WIDGETS_DIRNAME = 'Widgets';
const AIDE_DIRNAME = 'Foliole Aide';
const AGENTS_FILENAME = 'AGENTS.md';
const AIDE_DEVICE_DIRNAME = 'Aide';
const SKILLS_DIRNAME = 'Skills';

export interface FolioleAideRuntimePaths {
  agentsPath: string;
  attachmentsRoot: string;
  codexHome: string;
  deviceDataRoot: string;
  historyDatabasePath: string;
  skillsRoot: string;
  workspaceRoot: string;
  widgetRoot: string;
}

export function resolveFolioleAideRuntimePaths(
  userDataPath: string,
  libraryHome: string
): FolioleAideRuntimePaths {
  const widgetRoot = path.join(libraryHome, WIDGETS_DIRNAME, AIDE_DIRNAME);
  const deviceDataRoot = path.join(userDataPath, AIDE_DEVICE_DIRNAME);
  const workspaceRoot = path.join(deviceDataRoot, 'Workspace');
  return {
    agentsPath: path.join(widgetRoot, AGENTS_FILENAME),
    attachmentsRoot: path.join(workspaceRoot, 'Attachments'),
    codexHome: path.join(deviceDataRoot, 'Codex'),
    deviceDataRoot,
    historyDatabasePath: path.join(deviceDataRoot, 'history.db'),
    skillsRoot: path.join(widgetRoot, SKILLS_DIRNAME),
    workspaceRoot,
    widgetRoot
  };
}

export function ensureFolioleAideAgentsFile(paths: FolioleAideRuntimePaths) {
  fs.mkdirSync(paths.skillsRoot, { recursive: true });
  if (readExistingAgents(paths.agentsPath) === FOLIOLE_AIDE_AGENTS_CONTENT) return;
  const temporaryPath = `${paths.agentsPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, FOLIOLE_AIDE_AGENTS_CONTENT, 'utf8');
    fs.renameSync(temporaryPath, paths.agentsPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

export function readFolioleAideDeveloperInstructions(paths: FolioleAideRuntimePaths) {
  const instructions = fs.readFileSync(paths.agentsPath, 'utf8');
  return `${instructions}\nRuntime-managed locations:\n- Aide definition: ${paths.agentsPath}\n- Aide skills: ${paths.skillsRoot}\n`;
}

function readExistingAgents(filePath: string) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
