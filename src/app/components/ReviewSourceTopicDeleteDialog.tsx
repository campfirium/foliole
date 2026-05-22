import {
  AppButton,
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';

interface ReviewSourceTopicDeleteDialogProps {
  isOpen: boolean;
  nodeTitle: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ReviewSourceTopicDeleteDialog(props: ReviewSourceTopicDeleteDialogProps) {
  return (
    <AppDialog open={props.isOpen} onOpenChange={(open) => (!open ? props.onCancel() : undefined)}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>Delete source topic?</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {`This will move ${props.nodeTitle?.trim() || 'the source topic'} and its related items to Trash.`}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppDialogClose asChild>
              <AppButton variant="ghost">Cancel</AppButton>
            </AppDialogClose>
            <AppButton variant="primary" onClick={props.onConfirm}>
              Delete source topic
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
