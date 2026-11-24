import { randomUUID } from 'node:crypto';

let generation = randomUUID();
let controller = new AbortController();

export function readLibraryConnectionLifetime() {
  return { generation, signal: controller.signal };
}

export function endLibraryConnectionLifetime() {
  const previous = controller;
  generation = randomUUID();
  controller = new AbortController();
  previous.abort();
}
