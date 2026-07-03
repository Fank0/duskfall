"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Skull, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional fallback renderer; defaults to the DUSKFALL-styled error screen. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * ErrorBoundary — catches uncaught render-time errors anywhere in the
 * component subtree, displays a Russian dark-fantasy error screen, and
 * lets the user try again without reloading the page.
 *
 * Used at the top of the app (page.tsx) to wrap the entire game view.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to the console (server-side structured logging is handled by the
    // API routes; the client only has console here).
    console.error("[ErrorBoundary] uncaught error:", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <DefaultFallback error={error} reset={this.reset} />;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-950 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-800/60 bg-stone-900">
        <Skull className="h-8 w-8 text-red-400" />
      </div>
      <h1 className="font-serif text-2xl font-bold text-amber-300 text-glow">
        Туман сомкнулся…
      </h1>
      <p className="max-w-md text-sm text-stone-300">
        Произошла непредвиденная ошибка. Мастер подземелий потерял нить повествования.
        Попробуйте снова — или перезагрузите страницу.
      </p>
      <pre className="max-w-md overflow-x-auto rounded-md border border-red-900/40 bg-stone-900/60 px-3 py-2 text-[10px] text-red-300/80">
        {error.message || String(error)}
      </pre>
      <div className="flex gap-2">
        <Button onClick={reset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Попробовать снова
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Перезагрузить страницу
        </Button>
      </div>
    </div>
  );
}
