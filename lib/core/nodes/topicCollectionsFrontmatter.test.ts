import { describe, expect, it } from 'vitest';

import {
  addTopicCollection,
  readTopicCollections,
  removeTopicCollection,
  replaceTopicCollection,
  TopicCollectionsFrontmatterError
} from './topicCollectionsFrontmatter.js';

describe('topic collections frontmatter', () => {
  it('creates, merges, removes and replaces collections without changing other content', () => {
    const created = addTopicCollection('Body', '英国公司注册流程');
    expect(created).toBe('---\ncollections:\n  - "英国公司注册流程"\n---\nBody');
    const merged = addTopicCollection('---\ntitle: Keep\ncollections:\n  - Existing\n---\nBody', 'Next');
    expect(merged).toContain('title: Keep\ncollections:\n  - "Existing"\n  - "Next"');
    expect(removeTopicCollection(merged, 'Existing')).toContain('collections:\n  - "Next"');
    expect(replaceTopicCollection(merged, 'Existing', 'Renamed')).toContain('  - "Renamed"\n  - "Next"');
  });

  it('preserves CRLF and safely quotes YAML-sensitive names', () => {
    const content = addTopicCollection('---\r\ntitle: Keep\r\n---\r\nBody', 'on: hold #1');
    expect(content).toContain('collections:\r\n  - "on: hold #1"\r\n---');
    expect(readTopicCollections(content)).toEqual(['on: hold #1']);
    expect(readTopicCollections('---\ncollections:\n  - "true"\n  - "123"\n---\n')).toEqual(['true', '123']);
  });

  it('deduplicates and rejects malformed or ambiguous managed blocks', () => {
    expect(readTopicCollections('---\ncollections:\n  - Alpha\n  - Alpha\n---\n')).toEqual(['Alpha']);
    expect(() => readTopicCollections('---\ncollections: Alpha\n---\n')).toThrow(TopicCollectionsFrontmatterError);
    expect(() => readTopicCollections('---\ncollections:\n  value: Alpha\n---\n')).toThrow(TopicCollectionsFrontmatterError);
    expect(() => readTopicCollections('---\ncollections:\n  - Alpha')).toThrow(TopicCollectionsFrontmatterError);
  });
});
