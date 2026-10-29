// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import ts from 'typescript';
import { expect, it } from 'vitest';

const root = process.cwd();
const script = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts['typecheck:desktop:raw'];
const steps = script.split('&&').map(command => {
  const match = /^node --max-old-space-size=(\d+) node_modules\/typescript\/bin\/tsc -p (\S+) --noEmit$/u.exec(command.trim());
  if (!match) throw new Error(`Unexpected desktop typecheck command: ${command}`);
  return { heapMb: Number(match[1]), project: match[2] };
});

function parsedProject(project) {
  const { config, error } = ts.readConfigFile(project, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  return ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(path.resolve(project)));
}

it('reserves native process overhead below the hosted RSS limit', () => {
  for (const step of steps) expect(step.heapMb).toBeLessThanOrEqual(1536);
});

it('typechecks every renderer test once without dropping source or host projects', () => {
  const baseline = ['ts', 'tsx'].flatMap(extension => ts.parseJsonConfigFileContent({
    extends: './tsconfig.json',
    include: [`src/**/*.test.${extension}`, 'src/**/*.d.ts', 'src/test/setup.ts'],
  }, ts.sys, root).fileNames);
  const isRendererTest = file => file.startsWith(path.join(root, 'src') + path.sep) && /\.test\.tsx?$/u.test(file);
  const expected = baseline.filter(isRendererTest).sort();
  const actual = steps.flatMap(({ project }) => parsedProject(project).fileNames.filter(isRendererTest)).sort();
  expect(actual).toEqual(expected);
  expect(steps.map(({ project }) => project)).toContain('tsconfig.desktop-source.json');
  expect(steps.map(({ project }) => project)).toContain('electron/tsconfig.json');
});
