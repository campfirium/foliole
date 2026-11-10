import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { initializeCssSnippetDirectory, listCssSnippetFiles, resolveCssSnippetDirectory } from './cssSnippetFiles.js';

let library: string;

beforeEach(async () => {
  library = await mkdtemp(path.join(os.tmpdir(), 'foliole-css-'));
});

afterEach(async () => {
  await rm(library, { force: true, recursive: true });
});

it('creates the folder on request and reads only regular CSS files on each refresh', async () => {
  const directory = path.join(library, 'Widgets', 'CSS Snippets');
  expect(await listCssSnippetFiles(library)).toEqual({ path: directory, files: [] });
  expect(await resolveCssSnippetDirectory(library)).toEqual({ directory, exists: false });
  expect(await resolveCssSnippetDirectory(library, true)).toEqual({ directory, exists: true });

  const snippet = path.join(directory, 'headings.css');
  await writeFile(snippet, 'h1 { color: blue }');
  await writeFile(path.join(directory, 'notes.txt'), 'Ignore this');
  await mkdir(path.join(directory, 'nested.css'));
  await symlink(directory, path.join(directory, 'alias.css'), 'junction');
  await writeFile(path.join(directory, 'large.css'), Buffer.alloc(16385));
  expect((await listCssSnippetFiles(library)).files).toEqual([
    { name: 'headings.css', sourceCss: 'h1 { color: blue }' },
    { name: 'large.css', sourceCss: null }
  ]);

  await rm(snippet);
  expect((await listCssSnippetFiles(library)).files).toEqual([{ name: 'large.css', sourceCss: null }]);
});

it('creates an editable starter once and respects later edits and deletion', async () => {
  await initializeCssSnippetDirectory(library);
  const { path: directory, files } = await listCssSnippetFiles(library);
  expect(files).toEqual([{ name: 'CSS Example.css', sourceCss: expect.stringContaining('.cm-line-h1') }]);
  const starter = path.join(directory, 'CSS Example.css');
  expect(await readFile(starter, 'utf8')).toContain('Help > Developer Tools');

  const edited = '.cm-line-h1 { color: purple; }';
  await writeFile(starter, edited);
  await initializeCssSnippetDirectory(library);
  expect(await readFile(starter, 'utf8')).toBe(edited);

  await rm(starter);
  await initializeCssSnippetDirectory(library);
  expect((await listCssSnippetFiles(library)).files).toEqual([]);
});

it('rejects a symlinked snippet directory', async () => {
  const widgets = path.join(library, 'Widgets');
  await mkdir(widgets);
  await symlink(library, path.join(widgets, 'CSS Snippets'), 'junction');
  await expect(listCssSnippetFiles(library)).rejects.toThrow('must be a directory');
});
