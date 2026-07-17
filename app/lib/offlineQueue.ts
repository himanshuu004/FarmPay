/**
 * Offline write queue (client half of the offline-first foundation, §10).
 *
 * The farmer app writes logbook entries / receipts / evidence here FIRST — with
 * no signal — then flushes to POST /api/v1/sync when connectivity returns. The
 * server (shared/services/offlineSyncService) is idempotent (op_uuid) and
 * resolves conflicts server-wins, returning a CONFLICT status the app surfaces
 * to the farmer.
 *
 * State machine (mirrors the server): QUEUED_LOCAL → SYNCING → SYNCED | CONFLICT
 *
 * Storage is injected (AsyncStorage / SQLite / MMKV) so this stays testable and
 * harness-agnostic. This is the Phase-0 foundation; wiring to real screens is
 * Phase 1+.
 */

export type SyncStatus = 'QUEUED_LOCAL' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'FAILED';

export interface QueueOp {
  opUuid: string;              // client-generated (idempotency key)
  entityType: string;         // 'DairyCostEvent' | 'DairyRevenueEvent' | 'CoopInputOrder' | …
  entityRef?: string;         // target uuid for UPDATE
  action: 'CREATE' | 'UPDATE';
  payload: Record<string, unknown>;
  clientTs: string;           // ISO — capture time, used for server-wins ordering
  status: SyncStatus;
}

export interface KVStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const KEY = 'akcc.offline.queue.v1';

const uuid = (): string =>
  // RN crypto-lite; replace with expo-crypto in the app harness.
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export class OfflineQueue {
  constructor(private store: KVStore, private syncUrl: string) {}

  private async readAll(): Promise<QueueOp[]> {
    const raw = await this.store.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueueOp[]) : [];
  }
  private async writeAll(ops: QueueOp[]): Promise<void> {
    await this.store.setItem(KEY, JSON.stringify(ops));
  }

  /** Enqueue a write locally. Works with no signal. */
  async enqueue(op: Omit<QueueOp, 'opUuid' | 'status' | 'clientTs'> & Partial<Pick<QueueOp, 'clientTs'>>): Promise<QueueOp> {
    const ops = await this.readAll();
    const full: QueueOp = {
      opUuid: uuid(),
      clientTs: op.clientTs ?? new Date().toISOString(),
      status: 'QUEUED_LOCAL',
      entityType: op.entityType,
      entityRef: op.entityRef,
      action: op.action,
      payload: op.payload,
    };
    ops.push(full);
    await this.writeAll(ops);
    return full;
  }

  /** Flush pending ops to the server. Safe to call repeatedly (idempotent). */
  async flush(fetchImpl: typeof fetch = fetch): Promise<QueueOp[]> {
    const ops = await this.readAll();
    const pending = ops.filter((o) => o.status === 'QUEUED_LOCAL' || o.status === 'FAILED');
    if (pending.length === 0) return ops;

    pending.forEach((o) => (o.status = 'SYNCING'));
    await this.writeAll(ops);

    try {
      const res = await fetchImpl(this.syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: pending }),
      });
      const results = (await res.json()) as Array<{ opUuid: string; status: string }>;
      const byId = new Map(results.map((r) => [r.opUuid, r.status]));
      for (const o of ops) {
        const s = byId.get(o.opUuid);
        if (s === 'APPLIED' || s === 'DUPLICATE') o.status = 'SYNCED';
        else if (s === 'CONFLICT') o.status = 'CONFLICT'; // surface to farmer
        else if (s === 'FAILED') o.status = 'FAILED';
      }
    } catch {
      // Still offline — roll back to QUEUED_LOCAL for the next attempt.
      pending.forEach((o) => (o.status = 'QUEUED_LOCAL'));
    }
    await this.writeAll(ops);
    return ops;
  }
}
