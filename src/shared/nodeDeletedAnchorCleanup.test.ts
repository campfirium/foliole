import { describe, expect, it } from 'vitest';

import type { DatabaseDriver, DatabaseExecuteResult, DatabaseRow, DatabaseStatement } from '../../lib/core/database/driver';
import { cleanupDeletedTextAnchors } from '../../lib/core/database/nodeDeletedAnchorCleanup';

class FakeStatement implements DatabaseStatement {
  readonly sql: string;

  constructor(
    sql: string,
    private readonly handlers: {
      all?: (params?: readonly (string | number | bigint | Uint8Array | null)[]) => DatabaseRow[];
      get?: (params?: readonly (string | number | bigint | Uint8Array | null)[]) => DatabaseRow | undefined;
      run?: (params?: readonly (string | number | bigint | Uint8Array | null)[]) => DatabaseExecuteResult;
    }
  ) {
    this.sql = sql;
  }

  run(params?: readonly (string | number | bigint | Uint8Array | null)[]) {
    return this.handlers.run?.(params) ?? { changes: 0, lastInsertRowId: null };
  }

  get<T extends DatabaseRow = DatabaseRow>(params?: readonly (string | number | bigint | Uint8Array | null)[]) {
    return this.handlers.get?.(params) as T | undefined;
  }

  all<T extends DatabaseRow = DatabaseRow>(params?: readonly (string | number | bigint | Uint8Array | null)[]) {
    return (this.handlers.all?.(params) ?? []) as T[];
  }
}

function createDriver() {
  const deletedNodes = new Map<string, { anchor_link: string | null; parent_id: string | null }>();
  const parents = new Map<string, { content: string; title: string }>();
  const updates: Array<{ content: string; deletedAt: string; nodeId: string; openingText: string | null }> = [];

  const driver: DatabaseDriver = {
    prepare(sql: string) {
      if (sql === 'SELECT parent_id, anchor_link FROM nodes WHERE id = ?') {
        return new FakeStatement(sql, {
          get: (params) => deletedNodes.get(String(params?.[0] ?? ''))
        });
      }
      if (sql === 'SELECT content, title FROM nodes WHERE id = ?') {
        return new FakeStatement(sql, {
          get: (params) => parents.get(String(params?.[0] ?? ''))
        });
      }
      if (sql === 'UPDATE nodes SET content = ?, opening_text = ?, updated_at = ? WHERE id = ?') {
        return new FakeStatement(sql, {
          run: (params) => {
            updates.push({
              content: String(params?.[0] ?? ''),
              openingText: (params?.[1] as string | null) ?? null,
              deletedAt: String(params?.[2] ?? ''),
              nodeId: String(params?.[3] ?? '')
            });
            return { changes: 1, lastInsertRowId: null };
          }
        });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    execute() {
      throw new Error('Not implemented');
    },
    queryOne() {
      throw new Error('Not implemented');
    },
    queryAll() {
      throw new Error('Not implemented');
    },
    transaction<T>(execute: (driver: DatabaseDriver) => T) {
      return execute(driver);
    }
  };

  return { deletedNodes, driver, parents, updates };
}

describe('nodeDeletedAnchorCleanup', () => {
  it('removes opaque-id text anchors from parent content when the child is deleted', () => {
    const { deletedNodes, driver, parents, updates } = createDriver();
    deletedNodes.set('child-1', {
      anchor_link: JSON.stringify({ id: 'anchor-1', kind: 'highlight' }),
      parent_id: 'parent-1'
    });
    parents.set('parent-1', {
      content: 'Before <highlight id="anchor-1">Alpha</highlight id="anchor-1"> after',
      title: 'Parent'
    });

    const affectedParentIds = cleanupDeletedTextAnchors(driver, ['child-1'], '2026-04-14T12:00:00.000Z');

    expect(affectedParentIds).toEqual(['parent-1']);
    expect(updates).toEqual([
      {
        content: 'Before Alpha after',
        deletedAt: '2026-04-14T12:00:00.000Z',
        nodeId: 'parent-1',
        openingText: 'Before Alpha after'
      }
    ]);
  });

  it('skips parent rewrites when the parent is already pure markdown', () => {
    const { deletedNodes, driver, parents, updates } = createDriver();
    deletedNodes.set('child-1', {
      anchor_link: JSON.stringify({ id: 'anchor-1', kind: 'highlight' }),
      parent_id: 'parent-1'
    });
    parents.set('parent-1', {
      content: 'Before Alpha after',
      title: 'Parent'
    });

    const affectedParentIds = cleanupDeletedTextAnchors(driver, ['child-1'], '2026-04-14T12:00:00.000Z');

    expect(affectedParentIds).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('skips parent rewrites when the deleted node already uses a locator', () => {
    const { deletedNodes, driver, parents, updates } = createDriver();
    deletedNodes.set('child-1', {
      anchor_link: JSON.stringify({
        id: 'anchor-1',
        kind: 'highlight',
        locator: { from: 7, originalText: 'Alpha', to: 12 }
      }),
      parent_id: 'parent-1'
    });
    parents.set('parent-1', {
      content: 'Before Alpha after',
      title: 'Parent'
    });

    const affectedParentIds = cleanupDeletedTextAnchors(driver, ['child-1'], '2026-04-14T12:00:00.000Z');

    expect(affectedParentIds).toEqual([]);
    expect(updates).toEqual([]);
  });
});
