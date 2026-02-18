"use client";

import React, { Component, type ReactNode } from "react";
import { Map, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MapErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

interface MapErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for the story map canvas.
 * Catches errors in WorkflowBlock, story-map-canvas, and map data rendering.
 */
export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  constructor(props: MapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): MapErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[MapErrorBoundary]", error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="rounded-full bg-secondary p-4">
            <Map className="h-10 w-10 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Map failed to load</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              {this.state.error?.message ?? "The story map could not be displayed."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Reload map
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
