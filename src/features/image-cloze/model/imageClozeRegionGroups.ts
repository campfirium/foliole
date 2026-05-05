import type { Node, NodeImageRegionGroup } from '../../nodes/model/nodeTypes';

import { getImageClozeLocator } from './imageCloze';

export function appendUniqueRegions(
  groupsByAttachmentId: Map<string, NodeImageRegionGroup>,
  attachmentId: string,
  regions: NodeImageRegionGroup['regions']
) {
  const group = groupsByAttachmentId.get(attachmentId) ?? {
    attachmentId,
    regions: []
  };
  if (!groupsByAttachmentId.has(attachmentId)) {
    groupsByAttachmentId.set(attachmentId, group);
  }
  const regionIds = new Set(group.regions.map((region) => region.id));
  for (const region of regions) {
    if (regionIds.has(region.id)) {
      continue;
    }
    regionIds.add(region.id);
    group.regions.push(region);
  }
}

export function collectNodePresentedRegions(node: Node) {
  const presentedByAttachmentId = new Map<string, NodeImageRegionGroup>();
  for (const group of node.imageRegions ?? []) {
    appendUniqueRegions(presentedByAttachmentId, group.attachmentId, group.regions);
  }
  const locator = getImageClozeLocator(node.anchorLink);
  if (!locator) {
    return presentedByAttachmentId;
  }
  appendUniqueRegions(presentedByAttachmentId, locator.attachmentId, [
    {
      id: node.anchorLink?.id ?? `legacy-${node.id}`,
      height: locator.height,
      width: locator.width,
      x: locator.x,
      y: locator.y
    }
  ]);
  return presentedByAttachmentId;
}

export function collectChildRegionIds(nodes: Node[], parentNodeId: string) {
  const regionIdsByAttachmentId = new Map<string, Set<string>>();
  for (const node of nodes.filter((candidate) => candidate.parentNodeId === parentNodeId)) {
    const presentedRegions = collectNodePresentedRegions(node);
    for (const [attachmentId, group] of presentedRegions.entries()) {
      const regionIds = regionIdsByAttachmentId.get(attachmentId) ?? new Set<string>();
      for (const region of group.regions) {
        regionIds.add(region.id);
      }
      regionIdsByAttachmentId.set(attachmentId, regionIds);
    }
  }
  return regionIdsByAttachmentId;
}
