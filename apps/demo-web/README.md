# Demo Web App – Chat SSE Protocol

The demo chat endpoint (`/api/chat`) streams responses using **standard Server-Sent Events** rather than the
Vercel AI SDK data stream format. The client consumes these events directly to stay decoupled from any SDK-specific
conventions.

## Event Types

| Event        | Payload shape (JSON)                                                                                                                                          | Purpose |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `metadata`   | `{ "agentId": string, "jurisdictions": string[], "uncertaintyLevel": "low" \| "medium" \| "high", "disclaimerKey": string, "referencedNodes": string[] }` | Sent once per response to describe which agent/jurisdictions were used and what references/uncertainty apply. |
| `message`    | `{ "text": string }`                                                                                                                                         | One or more incremental message chunks in order. Concatenate `text` values to reconstruct the assistant reply. |
| `error`      | `{ "message": string }`                                                                                                                                      | Indicates a server-side failure. Clients should stop streaming and surface the error. |
| `done`       | `{ "status": "ok" \| "error" }`                                                                                                                          | Signals the end of the stream. `status` echoes whether the exchange completed successfully. |

Events are emitted as standard SSE blocks:

```
event: metadata
data: {"agentId":"global_regulatory_copilot","jurisdictions":["IE"],"uncertaintyLevel":"medium","disclaimerKey":"non_advice_research_tool","referencedNodes":["node1","node2"]}

```

All text content already includes the non‑advice disclaimer appended by the backend.

## Client Handling

The homepage chat client (`src/app/page.tsx`) uses `fetch` with a streaming reader to parse these events. For each block:

1. Read lines until a blank line is encountered.
2. Capture the `event:` type (defaults to `message` if missing) and concatenate `data:` lines.
3. `JSON.parse` the `data` payload and handle according to the table above.

Because the protocol is plain SSE, it can be reused by other front ends without pulling in the Vercel AI SDK or similar
helpers.
