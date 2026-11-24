import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const queueSize = 101;
const importedRanks = new Set([1, 11, 12, 21, queueSize]);

export async function writeSuperMemoPriorityCollection(directory: string) {
  const info = path.join(directory, 'info');
  await mkdir(info, { recursive: true });
  const tree = Buffer.alloc(queueSize * 37);
  const elements = Buffer.alloc(queueSize * 118);
  elements.writeUInt16LE(300, 16);
  elements.writeInt16LE(30, 18);
  const priorities = Buffer.alloc(queueSize * 4);
  const history = Buffer.alloc(39);
  history.writeInt32LE(1);
  history.writeUInt16LE(2, 4);
  history.writeDoubleLE((Date.UTC(2026, 10, 10) - Date.UTC(1899, 11, 30)) / 86_400_000, 10);
  history[24] = 4;
  for (let index = 0; index < queueSize; index++) {
    priorities.writeInt32LE(index + 1, index * 4);
    elements[index * 118 + 1] = 1;
  }
  await Promise.all(Object.entries({
    'contents.dat': tree, 'ElementInfo.dat': elements, 'repetitions.dat': Buffer.alloc(queueSize * 4),
    'priority.sub': priorities, 'RepetitionHistory.dat': history
  }).map(([name, bytes]) => writeFile(path.join(info, name), bytes)));

  const entries = Array.from({ length: queueSize }, (_, index) => {
    const id = index + 1;
    const type = importedRanks.has(id) ? 'Topic' : 'Unsupported';
    const learning = id === 1 ? '<LearningData><LastRepetition>10.11.2026</LastRepetition><Interval>300</Interval>' +
      '<RepHist>ElNo=1 Rep=2 Laps=0 Date=10.11.2026 Hour=3 Int=1 Grade=4</RepHist></LearningData>' : '';
    return `<SuperMemoElement><ID>${id}</ID><Type>${type}</Type><Title>Priority ${index}</Title>` +
      `<Content><Question>Rank ${id} content</Question></Content>${learning}</SuperMemoElement>`;
  }).join('');
  return `<SuperMemoCollection><Count>${queueSize}</Count>${entries}</SuperMemoCollection>`;
}
