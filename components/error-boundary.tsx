"use client";

import React, { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Fallback UI when error is caught */
  fallback?: ReactNode;
  /** User-facing title for the error state */
  title?: string;
  /** Optional retry callback */
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic error boundary. Catches React render errors in child tree.
 * Use MapErrorBoundary or ChatErrorBoundary for context-specific fallbacks.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {this.props.title ?? "Something went wrong"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
          </div>
          {this.props.onRetry && (
            <Button variant="outline" size="sm" onClick={this.handleRetry}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Try again
            </Button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
