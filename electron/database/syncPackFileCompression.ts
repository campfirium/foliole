import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createDeflate } from 'node:zlib';

function checksumStream() {
  const hash = createHash('sha256');
  let bytes = 0;
  return {
    stream: new Transform({
      transform(chunk: Buffer, _encoding, done) {
        hash.update(chunk);
        bytes += chunk.length;
        done(null, chunk);
      }
    }),
    result: () => ({ bytes, sha256: `sha256:${hash.digest('hex')}` })
  };
}

export async function deflateSyncPackDatabase(sourcePath: string, outputPath: string) {
  const raw = checksumStream();
  const compressed = checksumStream();
  await pipeline(
    createReadStream(sourcePath, { highWaterMark: 64 * 1024 }),
    raw.stream,
    createDeflate(),
    compressed.stream,
    createWriteStream(outputPath)
  );
  return { compressed: compressed.result(), raw: raw.result() };
}
