import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SyncOp } from '../api/fieldApi';

// Offline queue for supervisor verification submissions — the ONLY op type
// the backend's /field/sync endpoint can idempotently replay today (see
// verificationService.sync's doc comment: it hard-codes CiaFieldVerification
// handling). Vet-exam and inspection submissions are NOT queued here; those
// screens simply disable "Submit" while offline and ask the user to retry
// once signal returns, since there's no server-side idempotent-replay path
// for them yet — queuing those would silently risk duplicate/lost writes.

interface FieldDB extends DBSchema {
  verifyQueue: {
    key: string; // opUuid
    value: SyncOp & { status: 'QUEUED_LOCAL' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'FAILED'; queuedAt: string };
  };
}

let dbPromise: Promise<IDBPDatabase<FieldDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<FieldDB>('field-pwa', 1, {
      upgrade(db) {
        db.createObjectStore('verifyQueue', { keyPath: 'opUuid' });
      },
    });
  }
  return dbPromise;
}

export async function enqueueVerification(op: SyncOp) {
  const db = await getDb();
  await db.put('verifyQueue', { ...op, status: 'QUEUED_LOCAL', queuedAt: new Date().toISOString() });
}

export async function listQueue() {
  const db = await getDb();
  return db.getAll('verifyQueue');
}

export async function markStatus(opUuid: string, status: 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'FAILED') {
  const db = await getDb();
  const existing = await db.get('verifyQueue', opUuid);
  if (existing) await db.put('verifyQueue', { ...existing, status });
}

export async function removeSynced() {
  const db = await getDb();
  const all = await db.getAll('verifyQueue');
  const tx = db.transaction('verifyQueue', 'readwrite');
  await Promise.all(all.filter((o) => o.status === 'SYNCED').map((o) => tx.store.delete(o.opUuid)));
  await tx.done;
}

export function newOpUuid(): string {
  return crypto.randomUUID();
}
