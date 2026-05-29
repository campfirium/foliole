import type { NodeTreeRowIconKind } from '../../../nodes/components/NodeTreeRowIconModel';

import type { useNodeIconSettingsState } from './nodeIconSettingsState';

type EditableIconKind = Extract<NodeTreeRowIconKind, 'reading' | 'review'>;
type NodeIconSettingsState = ReturnType<typeof useNodeIconSettingsState>;

export type BaseRowConfig = {
  color: string;
  lineWidth: number;
  scale: number;
  setColor: (value: string) => void;
  setLineWidth: (value: number) => void;
  setScale: (value: number) => void;
};

export function getBaseConfig(state: NodeIconSettingsState, kind: EditableIconKind): BaseRowConfig {
  return kind === 'reading'
    ? {
        color: state.topicColor,
        lineWidth: state.topicLineWidth,
        scale: state.topicScale,
        setColor: state.setTopicColor,
        setLineWidth: state.setTopicLineWidth,
        setScale: state.setTopicScale
      }
    : {
        color: state.itemColor,
        lineWidth: state.itemLineWidth,
        scale: state.itemScale,
        setColor: state.setItemColor,
        setLineWidth: state.setItemLineWidth,
        setScale: state.setItemScale
      };
}
