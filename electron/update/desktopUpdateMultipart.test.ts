import { Writable } from 'node:stream';

import { DataSplitter } from 'electron-updater/out/differentialDownloader/DataSplitter.js';
import { expect, it } from 'vitest';

it.each([
  ['CRLF', '\r\n', false],
  ['LF', '\n', false],
  ['split CRLF', '\r\n', true],
  ['split LF', '\n', true]
] as const)('reconstructs differential update bytes from %s multipart responses', async (_name, eol, splitHeader) => {
  const chunks: Buffer[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  let completed = false;
  const splitter = new DataSplitter(
    output,
    { oldFileFd: -1, tasks: [], start: 0, end: 2 },
    new Map([[0, 0], [1, 1]]),
    'update-boundary',
    [3, 3],
    () => { completed = true; },
    6
  );
  const response = Buffer.from([
    '--update-boundary',
    'Content-Range: bytes 0-2/6',
    '',
    'abc',
    '--update-boundary',
    'Content-Range: bytes 3-5/6',
    '',
    'def',
    '--update-boundary--',
    ''
  ].join(eol));
  const splitAt = response.indexOf(eol + eol) + eol.length;
  const responses = splitHeader ? [response.subarray(0, splitAt), response.subarray(splitAt)] : [response];

  try {
    for (const chunk of responses) {
      await new Promise<void>((resolve, reject) => {
        splitter.write(chunk, (error) => error ? reject(error) : resolve());
      });
    }
    expect(Buffer.concat(chunks).toString()).toBe('abcdef');
    expect(completed).toBe(true);
  } finally {
    splitter.destroy();
    output.destroy();
  }
});
