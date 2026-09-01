import { expect, test } from './harness/fixtures';

test('concurrent desktop sync IPC writes keep separate sqlite transaction ownership', async ({ desktopWindow }) => {
  const result = await desktopWindow.evaluate(async () => {
    const api = globalThis.window?.electronAPI;
    if (!api) throw new Error('electron_api_unavailable');
    const timestamp = '2026-07-10T13:00:00.000Z';
    const record = (id: string, title: string) => ({
      ancestor_version_ids: [],
      content_hash: `hash-${id}`,
      host_name: 'hidden-native',
      object_id: id,
      object_type: 'node',
      parent_version_id: null,
      snapshot: {
        anchor_link: null,
        attachments: [],
        content: `# ${title}\n\nConcurrent SQLite ownership`,
        created_at: timestamp,
        deleted_at: null,
        desired_retention: 0.9,
        hide_title_heading: false,
        id,
        image_regions: null,
        is_title_manual: true,
        kind: 'item',
        opening_text: null,
        parent_id: null,
        position: 0,
        priority: 0,
        reveal: 'answer',
        title,
        updated_at: timestamp,
        virtual_filter: null
      },
      updated_at: timestamp,
      version_created_at: timestamp,
      version_id: `hidden-native:${id}:1`
    });
    const firstId = 'hidden-sqlite-owner-a';
    const secondId = 'hidden-sqlite-owner-b';
    const [firstApply, secondApply] = await Promise.all([
      api.invoke('apply_sync_nodes', { nodes: [record(firstId, 'Owner A')] }),
      api.invoke('apply_sync_nodes', { nodes: [record(secondId, 'Owner B')] })
    ]);
    const loaded = await api.invoke('load_sync_nodes', { objectIds: [firstId, secondId] });
    return { firstApply, loaded, secondApply };
  });

  expect(result.firstApply).toEqual(['hidden-sqlite-owner-a']);
  expect(result.secondApply).toEqual(['hidden-sqlite-owner-b']);
  expect(result.loaded).toEqual(expect.arrayContaining([
    expect.objectContaining({ object_id: 'hidden-sqlite-owner-a', snapshot: expect.objectContaining({ title: 'Owner A' }) }),
    expect.objectContaining({ object_id: 'hidden-sqlite-owner-b', snapshot: expect.objectContaining({ title: 'Owner B' }) })
  ]));
});
