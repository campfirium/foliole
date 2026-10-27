import { TextDecoder } from 'node:util';

import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import { decodeTextFile } from './decodeTextFile.js';

type HtmlNode = DefaultTreeAdapterTypes.Node;

function hasUnicodeBom(bytes: Uint8Array) {
  return [[0xef, 0xbb, 0xbf], [0xff, 0xfe], [0xfe, 0xff], [0, 0, 0xfe, 0xff]]
    .some((prefix) => prefix.every((byte, index) => bytes[index] === byte));
}

function declaredMetaEncoding(node: DefaultTreeAdapterTypes.Element) {
  const attributes = new Map(node.attrs.map(({ name, value }) => [name, value]));
  const charset = attributes.get('charset');
  if (charset !== undefined) return charset.trim() || null;
  if (attributes.get('http-equiv')?.toLowerCase() !== 'content-type') return null;
  const match = /charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;]+))/i.exec(attributes.get('content') ?? '');
  return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim() || null;
}

function findHtmlEncoding(bytes: Uint8Array) {
  // Parse actual markup so comments, raw script text and inert template contents
  // cannot supply a declaration. Read the whole local file, including late meta.
  const pending: HtmlNode[] = [parse(Buffer.from(bytes).toString('latin1'))];
  while (pending.length) {
    const node = pending.pop()!;
    if ('tagName' in node && node.tagName === 'meta') {
      const label = declaredMetaEncoding(node);
      if (label) return label;
    }
    if ('childNodes' in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
        pending.push(node.childNodes[index]!);
      }
    }
  }
  return null;
}

function decodeDeclaredHtml(bytes: Uint8Array, label: string) {
  try {
    // HTML treats UTF-16 meta declarations as UTF-8 unless a BOM already won,
    // and maps x-user-defined to windows-1252 rather than private-use characters.
    const normalized = label.toLowerCase() === 'x-user-defined' ? 'windows-1252' : label;
    const canonical = new TextDecoder(normalized).encoding;
    const encoding = canonical === 'utf-16le' || canonical === 'utf-16be' ? 'utf-8' : canonical;
    return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`HTML text could not be read using its declared encoding (${label}). Save a copy as UTF-8 and import it again.`);
  }
}

export function decodeHtmlFile(bytes: Uint8Array): string {
  if (hasUnicodeBom(bytes)) return decodeTextFile(bytes);
  const declared = findHtmlEncoding(bytes);
  if (declared) return decodeDeclaredHtml(bytes, declared);
  // Reuse the existing language-independent detector: UTF-8 first, then strong
  // candidates with strict full-file validation and disagreement rejection.
  return decodeTextFile(bytes);
}
