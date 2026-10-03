import { ReadwiseOriginalEpubExportMenuItem } from './ReadwiseOriginalEpubExportMenuItem';
import { ReadwiseOriginalEpubMenuItem } from './ReadwiseOriginalEpubMenuItem';
import { ReadwisePdfOriginalMenuItem } from './ReadwisePdfOriginalMenuItem';
import { ReadwiseSourceResyncMenuItem } from './ReadwiseSourceResyncMenuItem';

export function ReadwiseSourceMenuItems(props: {
  hasPreviousGroup: boolean;
  nodeId: string | null;
}) {
  return (
    <>
      <ReadwiseOriginalEpubMenuItem
        hasFollowingReadwiseAction
        hasPreviousGroup={props.hasPreviousGroup}
        nodeId={props.nodeId}
      />
      <ReadwiseSourceResyncMenuItem
        hasPreviousGroup={props.hasPreviousGroup}
        nodeId={props.nodeId}
      />
      <ReadwisePdfOriginalMenuItem nodeId={props.nodeId} />
      <ReadwiseOriginalEpubExportMenuItem nodeId={props.nodeId} />
    </>
  );
}
