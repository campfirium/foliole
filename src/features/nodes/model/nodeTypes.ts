export type NodeKind = 'source' | 'extract' | 'card';

interface BaseNode {
  id: string;
  kind: NodeKind;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceNode extends BaseNode {
  kind: 'source';
  content: string;
}

export interface ExtractNode extends BaseNode {
  kind: 'extract';
  sourceNodeId: string;
  quote: string;
}

export interface CardNode extends BaseNode {
  kind: 'card';
  sourceNodeId: string;
  prompt: string;
  response: string;
}

export type LearningNode = SourceNode | ExtractNode | CardNode;
