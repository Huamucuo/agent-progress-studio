/** Reserved host interface for broader Work / MCP Apps integration; the local metadata Hook source is separate. */
export interface ProgressSource {
  capabilities: { discover: boolean; notifications: boolean; history: boolean; usage: boolean; approvals: false };
  connect?(): Promise<unknown>;
  poll(): Promise<unknown>;
  close(): void;
}
export interface SnapshotHost {
  getSnapshot(): Promise<{ schemaVersion: 1; task: unknown; acceptance: unknown; evidence: unknown }>;
  subscribe?(onSnapshot: (snapshot: unknown) => void): () => void;
  openEvidence(kind: 'diff' | 'commit' | 'file' | 'report', id?: string): Promise<string>;
}

/** Exact on-disk Hook metadata; receiver accepts legacy four-field tool events. */
export type HookEventType = 'SessionStart' | 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop';
export interface HookBaseRecord {
  event_type: HookEventType; // input.hook_event_name
  session_id: string; // input.session_id, preserved verbatim
  turn_id: string | null; // input.turn_id ?? null
  timestamp: string; // recorder UTC ISO timestamp, not host event time
}
export type HookToolRecord = Omit<HookBaseRecord, 'event_type'> & (
  { event_type: 'PreToolUse'; tool_name: string | null; tool_status: 'started' } |
  { event_type: 'PostToolUse'; tool_name: string | null; tool_status: 'succeeded' | 'failed' | 'unknown' }
);
export type HookRecord = HookBaseRecord | HookToolRecord;
