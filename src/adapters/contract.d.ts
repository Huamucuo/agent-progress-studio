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
