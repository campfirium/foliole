import { redactDiagnosticValue } from './diagnosticRedactor.js';

// Stricter than the write-time redactor: applied only to text that leaves the device.
const MAX_EXPORTED_TEXT_LENGTH = 200;
const REDACTED_PATH = '[redacted-path]';
const REDACTED_TEXT = '[redacted-text]';
const PLACEHOLDER_PATTERN = /^\[(?:redacted-[a-z-]+|file)\](?:\.[a-z0-9]+)?$/u;

const ABSOLUTE_PATH_PATTERN = /(^|[\s([{=:,'"“‘「『《])((?:~|\/)[^\s"'<>)\]}”’」』》]*\/[^\s"'<>)\]}”’」』》]*)/gu;
const PAIRED_QUOTE_PATTERNS = [
  /"([^"\n]{1,400})"/gu,
  /“([^”\n]{1,400})”/gu,
  /‘([^’\n]{1,400})’/gu,
  /《([^》\n]{1,400})》/gu,
  /「([^」\n]{1,400})」/gu,
  /『([^』\n]{1,400})』/gu
];
// Single quotes only count at word boundaries so apostrophes such as "can't" survive.
const SINGLE_QUOTE_PATTERN = /(^|[\s([{:=,])'([^'\n]{1,400})'(?=$|[\s)\]},.;:])/gu;
const FILE_EXTENSIONS = [
  'epub', 'pdf', 'md', 'markdown', 'txt', 'html', 'htm', 'xhtml', 'xml', 'opf', 'ncx', 'css',
  'doc', 'docx', 'rtf', 'json', 'csv', 'zip', 'sqlite', 'db', 'png', 'jpg', 'jpeg', 'gif',
  'webp', 'svg', 'mp3', 'm4a', 'mp4', 'wav', 'apkg', 'kno'
].join('|');
const FILE_NAME_PATTERN = new RegExp(`[^\\s/\\\\'"<>:()\\[\\]{}“”‘’《》「」『』]+\\.(${FILE_EXTENSIONS})(?![\\p{L}\\p{N}_])`, 'giu');

function redactQuoted(inner: string, wrap: (value: string) => string) {
  return PLACEHOLDER_PATTERN.test(inner) ? wrap(inner) : wrap(REDACTED_TEXT);
}

export function redactExportedDiagnosticText(value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  let text = String(redactDiagnosticValue(String(value)));
  text = text.replace(ABSOLUTE_PATH_PATTERN, (_match, prefix: string) => `${prefix}${REDACTED_PATH}`);
  text = text.replace(FILE_NAME_PATTERN, (_match, extension: string) => `[file].${extension.toLowerCase()}`);
  for (const pattern of PAIRED_QUOTE_PATTERNS) {
    text = text.replace(pattern, (match, inner: string) =>
      redactQuoted(inner, (next) => `${match[0]}${next}${match[match.length - 1]}`));
  }
  text = text.replace(SINGLE_QUOTE_PATTERN, (_match, prefix: string, inner: string) =>
    redactQuoted(inner, (next) => `${prefix}'${next}'`));
  return text.length > MAX_EXPORTED_TEXT_LENGTH ? `${text.slice(0, MAX_EXPORTED_TEXT_LENGTH)}…` : text;
}
