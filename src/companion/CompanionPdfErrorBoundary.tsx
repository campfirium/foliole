import { Component, type ReactNode } from 'react';

export class CompanionPdfErrorBoundary extends Component<{
  children: ReactNode; fallback: ReactNode;
}, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  override render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
