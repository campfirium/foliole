export type XmlRpcValue = string | number | boolean | null | Buffer | XmlRpcValue[] | { [key: string]: XmlRpcValue };

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function serializeValue(value: XmlRpcValue): string {
  if (value === null) return '<value><nil/></value>';
  if (Buffer.isBuffer(value)) return `<value><base64>${value.toString('base64')}</base64></value>`;
  if (Array.isArray(value)) {
    return `<value><array><data>${value.map(serializeValue).join('')}</data></array></value>`;
  }
  if (typeof value === 'object') {
    const members = Object.entries(value).map(([key, entry]) =>
      `<member><name>${escapeXml(key)}</name>${serializeValue(entry)}</member>`).join('');
    return `<value><struct>${members}</struct></value>`;
  }
  if (typeof value === 'boolean') return `<value><boolean>${value ? '1' : '0'}</boolean></value>`;
  if (typeof value === 'number') {
    const tag = Number.isInteger(value) ? 'int' : 'double';
    return `<value><${tag}>${value}</${tag}></value>`;
  }
  return `<value><string>${escapeXml(value)}</string></value>`;
}

export function createXmlRpcCall(method: string, params: XmlRpcValue[]) {
  const serializedParams = params.map((param) => `<param>${serializeValue(param)}</param>`).join('');
  return `<?xml version="1.0"?><methodCall><methodName>${escapeXml(method)}</methodName><params>${serializedParams}</params></methodCall>`;
}

function decodeXml(value: string) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

class XmlCursor {
  index = 0;

  constructor(readonly xml: string) {}

  skipWhitespace() {
    while (/\s/u.test(this.xml[this.index] ?? '')) this.index += 1;
  }

  startsWith(value: string) {
    this.skipWhitespace();
    return this.xml.startsWith(value, this.index);
  }

  consume(value: string) {
    this.skipWhitespace();
    if (!this.xml.startsWith(value, this.index)) {
      throw new Error('WordPress returned an invalid XML-RPC response.');
    }
    this.index += value.length;
  }

  readUntil(value: string) {
    const end = this.xml.indexOf(value, this.index);
    if (end < 0) throw new Error('WordPress returned an invalid XML-RPC response.');
    const result = this.xml.slice(this.index, end);
    this.index = end;
    return result;
  }

  readOpenTag() {
    this.skipWhitespace();
    const match = /^<([A-Za-z0-9_.]+)(\s*\/?)>/u.exec(this.xml.slice(this.index));
    if (!match) throw new Error('WordPress returned an invalid XML-RPC response.');
    const name = match[1];
    const suffix = match[2];
    if (!name || suffix === undefined) throw new Error('WordPress returned an invalid XML-RPC response.');
    this.index += match[0].length;
    return { name, selfClosing: suffix.includes('/') };
  }
}

function parsePrimitive(tag: string, raw: string): XmlRpcValue {
  const decoded = decodeXml(raw);
  if (tag === 'boolean') return decoded.trim() === '1';
  if (tag === 'int' || tag === 'i4' || tag === 'i8' || tag === 'double') {
    const number = Number(decoded.trim());
    if (!Number.isFinite(number)) throw new Error('WordPress returned an invalid XML-RPC number.');
    return number;
  }
  if (tag === 'base64') return Buffer.from(decoded.trim(), 'base64');
  if (tag === 'nil') return null;
  return decoded;
}

function parseArray(cursor: XmlCursor) {
  cursor.consume('<data>');
  const result: XmlRpcValue[] = [];
  while (cursor.startsWith('<value>')) result.push(parseValue(cursor));
  cursor.consume('</data>');
  cursor.consume('</array>');
  return result;
}

function parseStruct(cursor: XmlCursor) {
  const result: Record<string, XmlRpcValue> = {};
  while (cursor.startsWith('<member>')) {
    cursor.consume('<member>');
    cursor.consume('<name>');
    const name = decodeXml(cursor.readUntil('</name>'));
    cursor.consume('</name>');
    result[name] = parseValue(cursor);
    cursor.consume('</member>');
  }
  cursor.consume('</struct>');
  return result;
}

function parseValue(cursor: XmlCursor): XmlRpcValue {
  cursor.consume('<value>');
  if (cursor.startsWith('</value>')) {
    cursor.consume('</value>');
    return '';
  }
  if (!cursor.startsWith('<')) {
    const text = decodeXml(cursor.readUntil('</value>'));
    cursor.consume('</value>');
    return text;
  }
  const tag = cursor.readOpenTag();
  let value: XmlRpcValue;
  if (tag.selfClosing) {
    value = parsePrimitive(tag.name, '');
  } else if (tag.name === 'array') {
    value = parseArray(cursor);
  } else if (tag.name === 'struct') {
    value = parseStruct(cursor);
  } else {
    const raw = cursor.readUntil(`</${tag.name}>`);
    cursor.consume(`</${tag.name}>`);
    value = parsePrimitive(tag.name, raw);
  }
  cursor.consume('</value>');
  return value;
}

function toFaultError(value: XmlRpcValue) {
  if (value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)) {
    const fault = value as Record<string, XmlRpcValue>;
    const message = typeof fault.faultString === 'string' ? fault.faultString : 'WordPress XML-RPC request failed.';
    const code = typeof fault.faultCode === 'number' ? ` (${fault.faultCode})` : '';
    return new Error(`${message}${code}`);
  }
  return new Error('WordPress XML-RPC request failed.');
}

export function parseXmlRpcResponse(xml: string): XmlRpcValue {
  const start = xml.indexOf('<methodResponse');
  if (start < 0) throw new Error('WordPress returned an invalid XML-RPC response.');
  const cursor = new XmlCursor(xml);
  cursor.index = xml.indexOf('>', start) + 1;
  if (cursor.startsWith('<fault>')) {
    cursor.consume('<fault>');
    throw toFaultError(parseValue(cursor));
  }
  cursor.consume('<params>');
  cursor.consume('<param>');
  return parseValue(cursor);
}
