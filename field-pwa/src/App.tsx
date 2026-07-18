import { useEffect, useState } from 'react';
import { useSession } from './auth/SessionContext';
import { LoginScreen } from './screens/LoginScreen';
import { TaskListScreen } from './screens/TaskListScreen';
import { VerificationScreen } from './screens/VerificationScreen';
import { VetExamScreen } from './screens/VetExamScreen';
import { InspectionScreen } from './screens/InspectionScreen';
import { SyncScreen } from './screens/SyncScreen';

export type View =
  | { screen: 'tasks' }
  | { screen: 'verify'; appUuid: string; farmerName: string | null }
  | { screen: 'vetExam'; appUuid: string; farmerName: string | null; earTagNo: string | null }
  | { screen: 'inspection'; appUuid: string; farmerName: string | null; dueDay: 7 | 30 | 90; earTagNo: string | null }
  | { screen: 'sync' };

function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function App() {
  const { user, signOut } = useSession();
  const online = useOnlineStatus();
  const [view, setView] = useState<View>({ screen: 'tasks' });

  if (!user) return <LoginScreen />;

  const roleLabel = user.role === 'ROUTE_SUPERVISOR' ? 'Route Supervisor' : 'Vet';

  return (
    <>
      {!online && <div className="offline-banner">⚡ Offline — verification submissions will queue and sync later</div>}
      <div className="appbar">
        <div>
          <h1>Allied KCC — Field</h1>
          <span className="role-tag">{roleLabel}</span>
        </div>
        <button onClick={signOut}>Sign out</button>
      </div>

      {view.screen === 'tasks' && <TaskListScreen onOpen={setView} />}
      {view.screen === 'verify' && (
        <VerificationScreen appUuid={view.appUuid} farmerName={view.farmerName} online={online} onDone={() => setView({ screen: 'tasks' })} />
      )}
      {view.screen === 'vetExam' && (
        <VetExamScreen appUuid={view.appUuid} farmerName={view.farmerName} earTagNo={view.earTagNo} onDone={() => setView({ screen: 'tasks' })} />
      )}
      {view.screen === 'inspection' && (
        <InspectionScreen
          appUuid={view.appUuid}
          farmerName={view.farmerName}
          dueDay={view.dueDay}
          earTagNo={view.earTagNo}
          onDone={() => setView({ screen: 'tasks' })}
        />
      )}
      {view.screen === 'sync' && <SyncScreen online={online} />}

      <div className="tabbar">
        <button className={view.screen === 'tasks' ? 'active' : ''} onClick={() => setView({ screen: 'tasks' })}>
          📋
          <br />
          Tasks
        </button>
        <button className={view.screen === 'sync' ? 'active' : ''} onClick={() => setView({ screen: 'sync' })}>
          🔄
          <br />
          Sync
        </button>
      </div>
    </>
  );
}
