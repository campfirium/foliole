import { expect, it } from 'vitest';

import { createXmlRpcCall, parseXmlRpcResponse } from './xmlRpcCodec.js';

it('serializes escaped method arguments and structured values', () => {
  const xml = createXmlRpcCall('wp.newPost', [1, 'user@example.com', 'a&b', {
    post_status: 'draft',
    post_title: '<Title>',
    sticky: false
  }]);

  expect(xml).toContain('<methodName>wp.newPost</methodName>');
  expect(xml).toContain('<string>a&amp;b</string>');
  expect(xml).toContain('<string>&lt;Title&gt;</string>');
  expect(xml).toContain('<boolean>0</boolean>');
});

it('parses arrays, structs, numbers, booleans, and base64', () => {
  const response = `<?xml version="1.0"?><methodResponse><params><param><value><array><data>
    <value><struct><member><name>blogid</name><value><string>42</string></value></member>
    <member><name>enabled</name><value><boolean>1</boolean></value></member>
    <member><name>count</name><value><int>2</int></value></member>
    <member><name>bytes</name><value><base64>aGk=</base64></value></member></struct></value>
  </data></array></value></param></params></methodResponse>`;

  const value = parseXmlRpcResponse(response) as Array<Record<string, unknown>>;
  expect(value[0]).toMatchObject({ blogid: '42', count: 2, enabled: true });
  expect((value[0]!.bytes as Buffer).toString('utf8')).toBe('hi');
});

it('surfaces XML-RPC faults without including request credentials', () => {
  const response = `<?xml version="1.0"?><methodResponse><fault><value><struct>
    <member><name>faultCode</name><value><int>403</int></value></member>
    <member><name>faultString</name><value><string>Authentication failed.</string></value></member>
  </struct></value></fault></methodResponse>`;

  expect(() => parseXmlRpcResponse(response)).toThrow('Authentication failed. (403)');
});

it('rejects malformed XML-RPC responses', () => {
  expect(() => parseXmlRpcResponse('<html>not xml-rpc</html>')).toThrow('invalid XML-RPC response');
});
