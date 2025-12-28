'use client';

import { useEffect } from 'react';

/**
 * Global error boundary for root-level error handling
 * Catches errors in the root layout and provides a fallback UI
 *
 * IMPORTANT: This file must define its own <html> and <body> tags
 * since it replaces the root layout when active.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for debugging
    // In production, this could be sent to an error tracking service
    console.error('Critical application error caught by global error boundary:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          <div style={{
            maxWidth: '28rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h1 style={{
                fontSize: '1.875rem',
                fontWeight: 'bold',
                letterSpacing: '-0.025em',
              }}>
                Critical Application Error
              </h1>
              <p style={{
                color: '#6b7280',
                fontSize: '1rem',
              }}>
                A critical error occurred that prevented the application from loading.
                Please refresh the page or contact support if the problem persists.
              </p>
            </div>

            {error.digest && (
              <div style={{
                borderRadius: '0.5rem',
                backgroundColor: '#f3f4f6',
                padding: '1rem',
                fontSize: '0.875rem',
              }}>
                <p style={{
                  fontFamily: 'monospace',
                  color: '#6b7280',
                }}>
                  Error ID: {error.digest}
                </p>
              </div>
            )}

            {process.env.NODE_ENV === 'development' && (
              <div style={{
                borderRadius: '0.5rem',
                backgroundColor: '#fee2e2',
                padding: '1rem',
                textAlign: 'left',
                fontSize: '0.875rem',
              }}>
                <p style={{
                  fontWeight: '600',
                  color: '#dc2626',
                }}>
                  Development Error Details:
                </p>
                <p style={{
                  marginTop: '0.5rem',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: '#991b1b',
                }}>
                  {error.message}
                </p>
                {error.stack && (
                  <pre style={{
                    marginTop: '0.5rem',
                    maxHeight: '10rem',
                    overflow: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: '#7f1d1d',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {error.stack}
                  </pre>
                )}
              </div>
            )}

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.625rem 1rem',
                  backgroundColor: '#18181b',
                  color: 'white',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#27272a';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#18181b';
                }}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '0.625rem 1rem',
                  backgroundColor: 'white',
                  color: '#18181b',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                }}
              >
                Go to home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
