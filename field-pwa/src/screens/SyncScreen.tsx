import { useEffect, useState } from 'react';
import { syncOps, type SyncOp } from '../api/fieldApi';
import { listQueue, markStatus, removeSynced } from '../offline/db';

const DEVICE_ID_KEY = 'field_pwa_device_id';
function deviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

type QueueRow = SyncOp & { status: string; queuedAt: string };

export function SyncScreen({ online }: { online: boolean }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setRows((await listQueue()) as QueueRow[]);
  };

  useEffect(() => {
    load();
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const queued = ((await listQueue()) as QueueRow[]).filter((r) => r.status === 'QUEUED_LOCAL' || r.status === 'FAILED');
      if (queued.length === 0) return;
      for (const r of queued) await markStatus(r.opUuid, 'SYNCING');
      await load();

      const ops: SyncOp[] = queued.map(({ status: _status, queuedAt: _queuedAt, ...op }) => op);
      const res = await syncOps(deviceId(), ops);
      if (res.success) {
        const results = (res.data as { synced: { opUuid: string; status: string }[] }).synced;
        for (const r of results) {
          const mapped = r.status === 'APPLIED' || r.status === 'DUPLICATE' ? 'SYNCED' : r.status === 'CONFLICT' ? 'CONFLICT' : 'FAILED';
          await markStatus(r.opUuid, mapped as 'SYNCED' | 'CONFLICT' | 'FAILED');
        }
        await removeSynced();
      } else {
        for (const r of queued) await markStatus(r.opUuid, 'FAILED');
      }
    } catch {
      const queued = (await listQueue()) as QueueRow[];
      for (const r of queued.filter((r) => r.status === 'SYNCING')) await markStatus(r.opUuid, 'FAILED');
    } finally {
      await load();
      setSyncing(false);
    }
  };

  return (
    <div className="content">
      {rows.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>✅</div>
          <p style={{ marginTop: 8 }}>Nothing queued on this device.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <b>{rows.length} item(s) queued on this device</b>
          </div>
          {rows.map((r) => (
            <div className="card row" key={r.opUuid}>
              <span>Verification · {r.appUuid.slice(0, 8)}…</span>
              <span className={`chip ${r.status === 'SYNCED' ? 'brand' : r.status === 'CONFLICT' || r.status === 'FAILED' ? 'danger' : 'blue'}`}>{r.status}</span>
            </div>
          ))}
          <p className="muted" style={{ margin: '10px 0' }}>
            Conflicts resolve server-wins — the farmer is notified. No data is lost with no signal.
          </p>
          <button className="btn" disabled={!online || syncing} onClick={syncNow}>
            {syncing ? <span className="spinner" /> : 'Sync now'}
          </button>
          {!online && <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>You're offline — connect to sync.</p>}
        </>
      )}
    </div>
  );
}
