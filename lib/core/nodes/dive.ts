export interface Dive {
  id: string;
  title: string;
  directSourceIds: readonly string[];
}

export function resolveDiveTopicIds(
  dive: Dive,
  topics: Iterable<{ id: string; ancestorFolderIds: readonly string[] }>
): Set<string> {
  const sources = new Set(dive.directSourceIds);
  const members = new Set<string>();
  for (const topic of topics) {
    if (sources.has(topic.id) || topic.ancestorFolderIds.some((id) => sources.has(id))) {
      members.add(topic.id);
    }
  }
  return members;
}
