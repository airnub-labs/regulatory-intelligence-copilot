/**
 * Compaction Button Component
 *
 * Manual trigger button for conversation compaction.
 * Shows loading state during compaction and displays results.
 */

'use client';

import { useState } from 'react';
import type { PathCompactionStrategy } from '@reg-copilot/reg-intel-conversations/compaction';

export interface CompactionButtonProps {
  conversationId: string;
  disabled?: boolean;
  strategy?: PathCompactionStrategy;
  onCompactionComplete?: (result: CompactionResult) => void;
  className?: string;
}

export interface CompactionResult {
  success: boolean;
  messagesBefore: number;
  messagesAfter: number;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  compressionRatio: number;
  durationMs: number;
  snapshotId?: string;
}

export function CompactionButton({
  conversationId,
  disabled = false,
  strategy = 'sliding_window',
  onCompactionComplete,
  className = '',
}: CompactionButtonProps) {
  const [isCompacting, setIsCompacting] = useState(false);
  const [lastResult, setLastResult] = useState<CompactionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCompact = async () => {
    setIsCompacting(true);
    setError(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/compact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Compaction failed');
      }

      if (data.success && data.result) {
        const result: CompactionResult = {
          success: true,
          messagesBefore: data.result.messagesBefore,
          messagesAfter: data.result.messagesAfter,
          tokensBefore: data.result.tokensBefore,
          tokensAfter: data.result.tokensAfter,
          tokensSaved: data.result.tokensBefore - data.result.tokensAfter,
          compressionRatio: data.result.tokensAfter / data.result.tokensBefore,
          durationMs: data.result.durationMs,
          snapshotId: data.result.snapshotId,
        };

        setLastResult(result);
        onCompactionComplete?.(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsCompacting(false);
    }
  };

  return (
    <div className={`compaction-button-container ${className}`}>
      <button
        onClick={handleCompact}
        disabled={disabled || isCompacting}
        className="compaction-button"
        aria-label="Compact conversation"
        title="Reduce conversation size by removing or summarizing messages"
      >
        {isCompacting ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Compacting...
          </>
        ) : (
          <>
            <svg
              className="icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 4h12M2 8h12M2 12h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Compact
          </>
        )}
      </button>

      {lastResult && (
        <div className="compaction-result" role="status">
          <p className="result-text">
            ✓ Saved {lastResult.tokensSaved.toLocaleString()} tokens (
            {((1 - lastResult.compressionRatio) * 100).toFixed(1)}%)
          </p>
          {lastResult.snapshotId && (
            <button
              className="undo-button"
              onClick={async () => {
                try {
                  const response = await fetch(`/api/conversations/${conversationId}/compact/rollback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ snapshotId: lastResult.snapshotId }),
                  });
                  const data = await response.json();
                  if (response.ok && data.success) {
                    setLastResult(null);
                  } else {
                    setError(data.error || 'Rollback failed');
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Rollback failed');
                }
              }}
              title="Undo compaction"
            >
              ↶ Undo
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="compaction-error" role="alert">
          Error: {error}
        </div>
      )}

      <style>{`
        .compaction-button-container {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .compaction-button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background-color: #3b82f6;
          color: white;
          border: none;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .compaction-button:hover:not(:disabled) {
          background-color: #2563eb;
        }

        .compaction-button:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }

        .spinner {
          display: inline-block;
          width: 1rem;
          height: 1rem;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .compaction-result {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          background-color: #ecfdf5;
          border: 1px solid #10b981;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        .result-text {
          flex: 1;
          margin: 0;
          color: #065f46;
        }

        .undo-button {
          padding: 0.25rem 0.75rem;
          background-color: transparent;
          border: 1px solid #10b981;
          border-radius: 0.25rem;
          color: #065f46;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .undo-button:hover {
          background-color: #10b981;
          color: white;
        }

        .compaction-error {
          padding: 0.5rem;
          background-color: #fef2f2;
          border: 1px solid #ef4444;
          border-radius: 0.375rem;
          color: #991b1b;
          font-size: 0.875rem;
        }

        .icon {
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
