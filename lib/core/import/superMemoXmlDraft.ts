interface SourceReview {
  date: string;
  hour: string | null;
  grade: number;
  repetition: number;
  lapses: number;
  raw: string;
}

export interface SuperMemoXmlDraftElement {
  id: number;
  parentId: number | null;
  children: number[];
  sourceType: string;
  title: string | null;
  ordinal: string | null;
  bodyOrQuestionHtml: string[];
  answerHtml: string[];
  skippedAudioComponents: number;
  learning: {
    lastRepetition: string | null;
    intervalDays: string | null;
    repetitions: string | null;
    lapses: string | null;
    sourceAFactor: string | null;
    sourceUFactor: string | null;
    history: SourceReview[];
  } | null;
}

function directChildren(element: Element, tag: string) {
  return Array.from(element.children).filter(child => child.tagName === tag);
}

function childText(element: Element, tag: string) {
  return directChildren(element, tag)[0]?.textContent ?? null;
}

function positiveInteger(text: string | null) {
  if (!text || !/^\d+$/.test(text.trim())) throw new Error('invalid_supermemo_element_number');
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('invalid_supermemo_element_number');
  return value;
}

function parseSourceReview(line: string, elementId: number): SourceReview {
  const match = /\bElNo=(\d+) Rep=(\d+) Laps=(\d+) Date=(\d{2}\.\d{2}\.\d{4}) (?:Hour=(\d+(?:\.\d+)?) )?.*?\bGrade=(\d+)/.exec(line);
  if (!match || Number(match[1]) !== elementId) throw new Error('invalid_supermemo_history_row');
  const [, , repetition, lapses, date, hour, grade] = match;
  if (hour && Number(hour) >= 24) throw new Error('invalid_supermemo_history_hour');
  return { date: date!, hour: hour ?? null, grade: Number(grade),
    repetition: Number(repetition), lapses: Number(lapses), raw: line.slice(match.index).trim() };
}

function parseLearning(element: Element, id: number): SuperMemoXmlDraftElement['learning'] {
  const data = directChildren(element, 'LearningData')[0];
  if (!data) return null;
  const history = (childText(data, 'RepHist') ?? '').split(/<br\s*\/?>|[\r\n]+/i)
    .filter(line => /\bElNo=/.test(line)).reverse().map(line => parseSourceReview(line, id));
  return { lastRepetition: childText(data, 'LastRepetition'), intervalDays: childText(data, 'Interval'),
    repetitions: childText(data, 'Repetitions'), lapses: childText(data, 'Lapses'),
    sourceAFactor: childText(data, 'AFactor'), sourceUFactor: childText(data, 'UFactor'), history };
}

function parseElement(element: Element, id: number, parentId: number | null, children: Element[]) {
  const sourceType = childText(element, 'Type');
  if (!sourceType) throw new Error('invalid_supermemo_element_type');
  const content = directChildren(element, 'Content')[0];
  return {
    id, parentId, children: children.map(child => positiveInteger(childText(child, 'ID'))),
    sourceType, title: childText(element, 'Title'), ordinal: childText(element, 'Ordinal'),
    bodyOrQuestionHtml: content ? directChildren(content, 'Question').map(part => part.textContent ?? '') : [],
    answerHtml: content ? directChildren(content, 'Answer').map(part => part.textContent ?? '') : [],
    skippedAudioComponents: content ? directChildren(content, 'Sound').length : 0,
    learning: parseLearning(element, id)
  } satisfies SuperMemoXmlDraftElement;
}

export function readSuperMemoXmlDraft(document: Document): SuperMemoXmlDraftElement[] {
  const root = document.documentElement;
  if (document.doctype || root?.tagName !== 'SuperMemoCollection') throw new Error('invalid_supermemo_xml');
  const declaredCount = positiveInteger(childText(root, 'Count'));
  const pending: Array<{ element: Element; parentId: number | null }> =
    directChildren(root, 'SuperMemoElement').reverse().map(element => ({ element, parentId: null }));
  const seen = new Set<number>();
  const result: SuperMemoXmlDraftElement[] = [];
  while (pending.length) {
    const { element, parentId } = pending.pop()!;
    const id = positiveInteger(childText(element, 'ID'));
    if (seen.has(id)) throw new Error('duplicate_supermemo_element');
    seen.add(id);
    const children = directChildren(element, 'SuperMemoElement');
    result.push(parseElement(element, id, parentId, children));
    for (const child of children.reverse()) pending.push({ element: child, parentId: id });
  }
  if (result.length !== declaredCount) throw new Error('supermemo_element_count_mismatch');
  return result;
}
