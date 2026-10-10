import { TextDecoder } from 'node:util';

import { analyse } from 'chardet';

function decodeStrict(bytes: Uint8Array, encoding: string) {
  return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes);
}

function declaredUnicodeEncoding(bytes: Uint8Array) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes[2] === 0 && bytes[3] === 0 ? 'utf-32le' : 'utf-16le';
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff) return 'utf-32be';
  return null;
}

function encodingFailure(detail: string) {
  return new Error(`Text encoding could not be read safely. ${detail} Save a copy as UTF-8 and import it again.`);
}

export function decodeTextFile(bytes: Uint8Array): string {
  const declared = declaredUnicodeEncoding(bytes);
  if (declared) {
    try {
      return decodeStrict(bytes, declared);
    } catch {
      throw encodingFailure(`The file declares ${declared}, but contains invalid or unsupported text.`);
    }
  }
  try {
    return decodeStrict(bytes, 'utf-8');
  } catch {
    return decodeDetectedText(bytes);
  }
}

function decodeDetectedText(bytes: Uint8Array): string {
  const candidates = analyse(bytes);
  // Detector scores are rankings, not probabilities. Require strong evidence and
  // validate the entire file; competing strong decodings must agree on the text.
  const strongCandidates = candidates.filter((candidate) => candidate.confidence >= 80);
  let decoded: string | undefined;
  for (const candidate of strongCandidates) {
    let content: string;
    try {
      content = decodeStrict(bytes, candidate.name);
    } catch {
      continue;
    }
    if (decoded !== undefined && decoded !== content) {
      throw encodingFailure(`Possible encodings: ${strongCandidates.map((item) => item.name).join(', ')}.`);
    }
    decoded = content;
  }
  if (decoded !== undefined) return decoded;
  const names = candidates.slice(0, 3).map((candidate) => candidate.name).join(', ');
  throw encodingFailure(names ? `Possible encodings: ${names}.` : 'The encoding is uncertain.');
}
