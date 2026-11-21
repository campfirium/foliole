// @vitest-environment node
import path from 'node:path';

import ts from 'typescript';
import { expect, it } from 'vitest';

import { createScanner, findingId } from './unstable-reference-heavy-work.mjs';

const ROOT = '/virtual';
const REACT_PDF = `
export declare function Document(props: { file: unknown; options?: object; onLoadSuccess?: () => void; children?: unknown }): any;
export declare function Page(props: { pageNumber: number; onRenderTextLayerSuccess?: () => void }): any;
`;

function scan(files) {
  const sources = new Map(
    Object.entries({ ...files, 'node_modules/react-pdf/index.d.ts': REACT_PDF }).map(
      ([name, text]) => [path.join(ROOT, name), text]
    )
  );
  const options = {
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022
  };
  const host = ts.createCompilerHost(options);
  host.fileExists = (fileName) => sources.has(fileName);
  host.readFile = (fileName) => sources.get(fileName);
  host.directoryExists = (directory) =>
    [...sources.keys()].some((name) => name.startsWith(`${directory}/`));
  host.realpath = (name) => name;
  host.getCurrentDirectory = () => ROOT;
  host.getSourceFile = (fileName, languageVersion) =>
    sources.has(fileName)
      ? ts.createSourceFile(fileName, sources.get(fileName), languageVersion, true)
      : undefined;
  host.getDefaultLibFileName = () => path.join(ROOT, 'lib.d.ts');
  sources.set(
    path.join(ROOT, 'lib.d.ts'),
    'interface Array<T> { filter(f: (v: T) => boolean): T[] } interface Promise<T> {} interface Function {} interface Object {} interface String {} interface Boolean {} interface Number {} interface RegExp {} interface IArguments {} interface CallableFunction {} interface NewableFunction {}'
  );
  const rootNames = Object.keys(files).map((name) => path.join(ROOT, name));
  const program = ts.createProgram({ rootNames, options, host });
  const productionFiles = rootNames.map((name) => program.getSourceFile(name));
  return createScanner({ program, repoRoot: ROOT }).run(productionFiles).findings;
}

const PDF_SOURCE = `export declare function loadAttachmentPdfSource(id: string): Promise<string>;`;

const PDF_DOCUMENT_BEFORE_FIX = `
import { useEffect, useState } from 'react';
import { loadAttachmentPdfSource } from './source';
function useAttachmentPdfSource(attachmentId: string, onMissingResource?: (id: string) => Promise<void>) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    void loadAttachmentPdfSource(attachmentId).then(setSource, () => onMissingResource?.(attachmentId));
  }, [attachmentId, onMissingResource]);
  return source;
}
export function SimplePdfDocument(props: { attachmentId: string; onMissingResource?: (id: string) => Promise<void> }) {
  const source = useAttachmentPdfSource(props.attachmentId, props.onMissingResource);
  return <div>{source}</div>;
}
`;

const READER = `
import { SimplePdfDocument } from './SimplePdfDocument';
export function Reader(props: { id: string; sync(id: string): Promise<void> }) {
  return <SimplePdfDocument attachmentId={props.id} onMissingResource={(id) => props.sync(id)} />;
}
`;

it('reports an inline callback that reaches a heavy load effect through a component and hook', () => {
  const findings = scan({
    'src/source.ts': PDF_SOURCE,
    'src/SimplePdfDocument.tsx': PDF_DOCUMENT_BEFORE_FIX,
    'src/Reader.tsx': READER
  });
  expect(findings.map((finding) => [finding.tier, finding.owner, finding.reason])).toEqual([
    ['heavy', 'src/Reader.tsx#Reader', 'inline function']
  ]);
  expect(findingId(findings[0])).toContain(
    'src/SimplePdfDocument.tsx#useAttachmentPdfSource useEffect deps'
  );
});

it('stays quiet once the callback is read through a ref', () => {
  const fixed = PDF_DOCUMENT_BEFORE_FIX.replace(
    'useEffect, useState',
    'useEffect, useRef, useState'
  )
    .replace('const [source', 'const handler = useRef(onMissingResource);\n  const [source')
    .replace('onMissingResource?.(attachmentId)', 'handler.current?.(attachmentId)')
    .replace('[attachmentId, onMissingResource]', '[attachmentId]');
  expect(
    scan({
      'src/source.ts': PDF_SOURCE,
      'src/SimplePdfDocument.tsx': fixed,
      'src/Reader.tsx': READER
    })
  ).toEqual([]);
});

const TEXT_LAYER_PAGE = (hookBody) => `
import { useCallback } from 'react';
import { Page } from 'react-pdf';
function useMeasure(props: { onReady?: () => void }) { ${hookBody} }
export function SimplePdfPage(props: { onReady?: () => void }) {
  const onTextLayerReady = useMeasure(props);
  return <Page pageNumber={1} onRenderTextLayerSuccess={onTextLayerReady} />;
}
`;

it('follows a custom hook return value into a third-party text layer prop', () => {
  const findings = scan({
    'src/SimplePdfPage.tsx': TEXT_LAYER_PAGE('return () => { props.onReady?.(); };')
  });
  expect(findings.map((finding) => finding.reason)).toEqual([
    'useMeasure() returns inline function'
  ]);
  expect(
    scan({ 'src/SimplePdfPage.tsx': TEXT_LAYER_PAGE('return useCallback(() => {}, []);') })
  ).toEqual([]);
});

it('ignores third-party callbacks the library keeps out of its effect deps and primitive deps', () => {
  const findings = scan({
    'src/Viewer.tsx': `
import { Document } from 'react-pdf';
export function Viewer(props: { file: string }) {
  return <Document file={props.file} onLoadSuccess={() => {}} />;
}
export function Parent() { return <Viewer file={'a' + 'b'} />; }
`
  });
  expect(findings).toEqual([]);
});
