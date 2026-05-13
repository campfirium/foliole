import React from 'react';

import { createStartupErrorSurfaceModel, StartupSurface } from './StartupSurface';

interface StartupErrorBoundaryProps {
  children: React.ReactNode;
  moduleLabel: string;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface StartupErrorBoundaryState {
  message: string | null;
}

export class StartupErrorBoundary extends React.Component<StartupErrorBoundaryProps, StartupErrorBoundaryState> {
  override state: StartupErrorBoundaryState = {
    message: null
  };

  static getDerivedStateFromError(error: Error): StartupErrorBoundaryState {
    return {
      message: error.message || 'Unknown renderer exception'
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
  }

  override render() {
    if (!this.state.message) {
      return this.props.children;
    }

    return (
      <StartupSurface
        model={createStartupErrorSurfaceModel({
          message: this.state.message,
          moduleLabel: this.props.moduleLabel
        })}
      />
    );
  }
}
