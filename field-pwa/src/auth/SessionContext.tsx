import { createContext, useContext, useState, type ReactNode } from 'react';
import { session, type SessionUser } from '../api/client';

type SessionCtx = {
  user: SessionUser | null;
  setUser: (u: SessionUser | null) => void;
  signOut: () => void;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(session.getUser());

  const setUser = (u: SessionUser | null) => {
    setUserState(u);
  };
  const signOut = () => {
    session.clear();
    setUserState(null);
  };

  return <Ctx.Provider value={{ user, setUser, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
