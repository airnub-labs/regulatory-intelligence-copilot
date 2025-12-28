'use client';

import { useEffect } from 'react';

/**
 * Error boundary for app-level error handling
 * Catches errors in route segments and their children
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for debugging
    // In production, this could be sent to an error tracking service
    console.error('Application error caught by error boundary:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
          <p className="text-muted-foreground">
            We encountered an unexpected error. Please try again or contact support if the problem persists.
          </p>
        </div>

        {error.digest && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-mono text-muted-foreground">Error ID: {error.digest}</p>
          </div>
        )}

        {process.env.NODE_ENV === 'development' && (
          <div className="rounded-lg bg-destructive/10 p-4 text-left text-sm">
            <p className="font-semibold text-destructive">Development Error Details:</p>
            <p className="mt-2 font-mono text-xs text-destructive/80">{error.message}</p>
            {error.stack && (
              <pre className="mt-2 max-h-40 overflow-auto font-mono text-xs text-destructive/70">
                {error.stack}
              </pre>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            Go to home
          </button>
        </div>
      </div>
    </div>
  );
}
