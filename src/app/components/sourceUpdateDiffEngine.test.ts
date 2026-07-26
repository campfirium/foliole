import { Chunk } from '@codemirror/merge';
import { describe, expect, it, vi } from 'vitest';

import {
  createSourceUpdateDiffSnapshot,
  updateSourceUpdateDiffSnapshot
} from './sourceUpdateDiffEngine';

describe('sourceUpdateDiffEngine', () => {
  it('updates only the edited side through CodeMirror incremental chunks', () => {
    const updateA = vi.spyOn(Chunk, 'updateA');
    const updateB = vi.spyOn(Chunk, 'updateB');
    let snapshot = createSourceUpdateDiffSnapshot('Alpha\nShared', 'Beta\nShared');

    snapshot = updateSourceUpdateDiffSnapshot(snapshot, 'Alpha revised\nShared', 'Beta\nShared');
    expect(snapshot.currentDoc.toString()).toBe('Alpha revised\nShared');
    expect(updateA).toHaveBeenCalledTimes(1);
    expect(updateB).not.toHaveBeenCalled();

    snapshot = updateSourceUpdateDiffSnapshot(snapshot, 'Alpha revised\nShared', 'Beta revised\nShared');
    expect(snapshot.updatedDoc.toString()).toBe('Beta revised\nShared');
    expect(updateA).toHaveBeenCalledTimes(1);
    expect(updateB).toHaveBeenCalledTimes(1);
  });

  it('keeps long unrelated drafts inside the bounded official diff path', () => {
    const current = Array.from({ length: 1_000 }, (_, index) => `Current paragraph ${index}.`).join('\n');
    const updated = Array.from({ length: 1_000 }, (_, index) => `Updated paragraph ${index}.`).join('\n');

    const snapshot = createSourceUpdateDiffSnapshot(current, updated);

    expect(snapshot.currentDoc.lines).toBe(1_000);
    expect(snapshot.updatedDoc.lines).toBe(1_000);
    expect(snapshot.chunks.length).toBeGreaterThan(0);
  });

  it('keeps an identical standalone line outside nearby long changed chunks', () => {
    const shared = '我知道长任务消耗很大，但没想到会这么大。特别是大量调用工具的长任务，token 消耗速度相当惊人。';
    const current = [
      '一次 Agentic Coding 工作流调整：任务粒度与提交、归档时机',
      '长任务的实际成本',
      '最近全程 codex 5.6-sol 中， 20x 3天烧完了周限，于是和 agent 仔细分析了下原因：',
      shared,
      '过去，因为之前把任务粒度拆的比较碎导致质量也非常碎，矫枉过正，直接以实施方案为单位来开线程，一个线程从需求讨论开始、经过方案会审、实施、修改到最后的准完全验收，觉得这样减少意图漂移，token的开销也还能接受（20x 大部分时间没用完），质量也马马虎虎，就这么用了下来。',
      '顺便分析了下之前的整个工作流，发现我把 commit 当 PR 用的习惯也严重错误，我习惯等到整个方案实施并验收以后，再统一提交。一次提交能够覆盖一个完整结果，并且尽可能干净、正确，最好不再需要后续修正。两相叠加，再碰上更会调用工具（？）的 sol，token 用量感人……'
    ].join('\n');
    const updated = [
      '一次 Agentic Coding 工作流调整：任务粒度与提交、归档时机',
      '长任务的实际成本',
      '最近一直在用 Codex 5.6-sol，20x 额度三天就烧完了周限。',
      shared,
      '过去，我曾经把任务粒度拆得很碎，结果实施质量也非常碎。后来矫枉过正，直接以整份实施方案为单位开线程：一个线程从需求讨论开始，经过方案会审、实施、修改，直到接近完整验收。',
      '当时觉得，这样可以减少意图漂移，token 开销也还能接受——20x 大部分时候甚至用不完——质量也马马虎虎，于是就一直沿用了下来。'
    ].join('\n');

    const snapshot = createSourceUpdateDiffSnapshot(current, updated);
    const changedLineRanges = snapshot.chunks.map((chunk) => ({
      currentFrom: snapshot.currentDoc.lineAt(chunk.fromA).number,
      currentTo: snapshot.currentDoc.lineAt(chunk.endA).number,
      precise: chunk.precise,
      updatedFrom: snapshot.updatedDoc.lineAt(chunk.fromB).number,
      updatedTo: snapshot.updatedDoc.lineAt(chunk.endB).number
    }));

    expect(changedLineRanges).toEqual([
      { currentFrom: 3, currentTo: 3, precise: true, updatedFrom: 3, updatedTo: 3 },
      { currentFrom: 5, currentTo: 6, precise: true, updatedFrom: 5, updatedTo: 6 }
    ]);
  });
});
