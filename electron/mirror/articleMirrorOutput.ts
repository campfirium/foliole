import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { collectArticleMirrorPlans, type ArticleMirrorPlan } from './articleMirrorPlanning.js';
import {
  renderSingleArticleMirrorRaw,
  type MirrorRenderableNode
} from './articleMirrorRenderCore.js';
import { rewriteMirrorMarkdownAttachmentPaths } from './markdownAttachmentPaths.js';

type ArticleNode = WorkspaceSnapshot['nodesById'][string];

export type { MirrorRenderableNode } from './articleMirrorRenderCore.js';

export interface ArticleMirrorTarget {
  articleId: string;
  markdown: string;
  relativePath: string;
  sourceUpdatedAt: string;
  targetPath: string;
}

export function renderSingleArticleMirror(
  article: MirrorRenderableNode,
  derivedChildren: MirrorRenderableNode[],
  manualTopics: MirrorRenderableNode[]
): string {
  return rewriteMirrorMarkdownAttachmentPaths(
    renderSingleArticleMirrorRaw(article, derivedChildren, manualTopics)
  );
}

export function collectArticleMirrorTargets(snapshot: WorkspaceSnapshot, mirrorRoot: string): ArticleMirrorTarget[] {
  return collectArticleMirrorPlans(snapshot, mirrorRoot).map((plan) => renderArticleMirrorPlan(snapshot, plan));
}

export function renderArticleMirrorPlan(snapshot: WorkspaceSnapshot, plan: ArticleMirrorPlan): ArticleMirrorTarget {
  const article = snapshot.nodesById[plan.articleId];
  if (!article) throw new Error(`Mirror article is missing from snapshot: ${plan.articleId}`);
  const derivedChildren = plan.derivedNodeIds
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node): node is ArticleNode => node !== undefined);
  const manualTopics = plan.manualTopicIds
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node): node is ArticleNode => node !== undefined);
  return {
    articleId: plan.articleId,
    markdown: renderSingleArticleMirror(article, derivedChildren, manualTopics),
    relativePath: plan.relativePath,
    sourceUpdatedAt: plan.sourceUpdatedAt,
    targetPath: plan.targetPath
  };
}
