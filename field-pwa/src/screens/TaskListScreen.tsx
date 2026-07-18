import { useEffect, useState } from 'react';
import { getTasks, type FieldTask } from '../api/fieldApi';
import type { View } from '../App';

export function TaskListScreen({ onOpen }: { onOpen: (v: View) => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tasks, setTasks] = useState<FieldTask[]>([]);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getTasks();
      if (res.success) setTasks((res.data as FieldTask[]) || []);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="content">
        <p className="muted" style={{ textAlign: 'center', marginTop: 40 }}>
          Loading tasks…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content">
        <div className="empty-state">
          <p>Couldn't load tasks. Check your connection.</p>
          <button className="btn sm" style={{ width: 'auto', marginTop: 12, display: 'inline-block' }} onClick={load}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="content">
        <div className="empty-state">
          <div style={{ fontSize: 40 }}>✅</div>
          <p style={{ marginTop: 8 }}>No tasks right now. Pull to refresh, or check back later.</p>
          <button className="btn sm" style={{ width: 'auto', marginTop: 12, display: 'inline-block' }} onClick={load}>
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      {tasks.map((t) => (
        <TaskCard key={`${t.kind}-${t.applicationUuid}`} task={t} onOpen={onOpen} />
      ))}
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: FieldTask; onOpen: (v: View) => void }) {
  if (task.kind === 'verify') {
    return (
      <div
        className="card"
        onClick={() => onOpen({ screen: 'verify', appUuid: task.applicationUuid, farmerName: task.farmerName })}
        style={{ cursor: 'pointer' }}
      >
        <div className="row">
          <span className="chip brand">Verify</span>
          <span className="muted">{task.dcsRef}</span>
        </div>
        <p style={{ fontWeight: 700, marginTop: 8 }}>{task.farmerName || task.farmerRef}</p>
        <p className="muted">
          {task.requestedCattleCount ?? '—'} cattle requested{task.preferredBreed ? ` · ${task.preferredBreed}` : ''}
        </p>
      </div>
    );
  }
  if (task.kind === 'vetExam') {
    return (
      <div
        className="card"
        onClick={() => onOpen({ screen: 'vetExam', appUuid: task.applicationUuid, farmerName: task.farmerName, earTagNo: task.earTagNo })}
        style={{ cursor: 'pointer' }}
      >
        <div className="row">
          <span className="chip blue">Vet exam</span>
          <span className="muted">{task.dcsRef}</span>
        </div>
        <p style={{ fontWeight: 700, marginTop: 8 }}>{task.farmerName || task.farmerRef}</p>
        <p className="muted">
          {task.earTagNo || 'no ear tag yet'} · {task.species || '—'} {task.breed || ''}
        </p>
      </div>
    );
  }
  // inspection
  return (
    <div
      className="card"
      onClick={() =>
        onOpen({ screen: 'inspection', appUuid: task.applicationUuid, farmerName: task.farmerName, dueDay: task.dueDay as 7 | 30 | 90, earTagNo: task.earTagNo })
      }
      style={{ cursor: 'pointer' }}
    >
      <div className="row">
        <span className={`chip ${task.overdue ? 'danger' : 'gold'}`}>{task.dueDay}-day inspection</span>
        <span className="muted">{task.dcsRef}</span>
      </div>
      <p style={{ fontWeight: 700, marginTop: 8 }}>{task.farmerName || task.farmerRef}</p>
      <p className="muted">
        {task.earTagNo || '—'} · due {new Date(task.dueDate).toLocaleDateString()} {task.overdue ? '(overdue)' : ''}
      </p>
    </div>
  );
}
