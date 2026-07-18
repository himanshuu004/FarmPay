import { useState } from 'react';
import { api, session } from '../api/client';
import { useSession } from '../auth/SessionContext';

const ALLOWED_ROLES = ['ROUTE_SUPERVISOR', 'VET'];

export function LoginScreen() {
  const { setUser } = useSession();
  const [mobile, setMobile] = useState('');
  const [mpin, setMpin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (mobile.trim().length !== 10 || mpin.trim().length !== 4) {
      setError('Enter a 10-digit mobile number and 4-digit MPIN.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', { mobile: mobile.trim(), mpin: mpin.trim() });
      if (res.success && res.data) {
        const u = res.data as { accessToken: string; refreshToken: string; user: { userId: string; firstName: string; lastName: string | null; mobile: string; role: string } };
        if (!ALLOWED_ROLES.includes(u.user.role)) {
          setError(`This app is for Route Supervisors and Vets only. Your account role is ${u.user.role}.`);
          return;
        }
        session.set(u.accessToken, u.refreshToken, u.user);
        setUser(u.user);
      } else {
        setError(res.message || 'Login failed.');
      }
    } catch {
      setError('Could not connect. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100svh' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40 }}>🐄</div>
        <h1 style={{ fontSize: 20, marginTop: 8 }}>Allied KCC — Field</h1>
        <p className="muted">Route Supervisor &amp; Vet sign-in</p>
      </div>
      <label className="field-label">Mobile number</label>
      <input
        className="input"
        type="tel"
        maxLength={10}
        value={mobile}
        onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
        placeholder="9876500000"
        autoFocus
      />
      <label className="field-label">MPIN</label>
      <input
        className="input"
        type="password"
        maxLength={4}
        value={mpin}
        onChange={(e) => setMpin(e.target.value.replace(/\D/g, ''))}
        placeholder="••••"
        style={{ textAlign: 'center', letterSpacing: 8, fontSize: 20 }}
      />
      {error && (
        <div className="card" style={{ background: 'var(--danger-bg)', border: '1px solid #f1c7c1', marginTop: 12 }}>
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>
        </div>
      )}
      <button className="btn" style={{ marginTop: 18 }} onClick={submit} disabled={loading}>
        {loading ? <span className="spinner" /> : 'Sign in'}
      </button>
    </div>
  );
}
