import { Component, createRef, type ComponentPropsWithoutRef } from 'react';

type Props = ComponentPropsWithoutRef<'div'> & {
  unavailable: boolean;
  side: 'left' | 'right';
};

function returnSidebarFocus(side: Props['side']) {
  const toggles = document.querySelectorAll<HTMLElement>(`[data-workspace-sidebar-toggle="${side}"]`);
  const toggle = Array.from(toggles).find((element) => element.getClientRects().length > 0);
  const destination = toggle ?? document.querySelector<HTMLElement>('[data-workspace-document-focus-target]');
  destination?.focus({ preventScroll: true });
}

// Capture focus before hidden/inert updates can make the browser discard it.
export class WorkspaceSidebarFocusBoundary extends Component<Props, object, boolean> {
  private element = createRef<HTMLDivElement>();

  override getSnapshotBeforeUpdate(previous: Props) {
    return !previous.unavailable && this.props.unavailable
      && Boolean(this.element.current?.contains(document.activeElement));
  }

  override componentDidUpdate(_previous: Props, _state: object, ownedFocus: boolean) {
    if (ownedFocus) returnSidebarFocus(this.props.side);
  }

  override componentWillUnmount() {
    if (this.element.current?.contains(document.activeElement)) returnSidebarFocus(this.props.side);
  }

  override render() {
    const { unavailable, side, ...props } = this.props;
    void side;
    return <div {...props} ref={this.element} inert={unavailable} />;
  }
}
