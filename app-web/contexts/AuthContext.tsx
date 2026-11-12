import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { authApi } from "../services/authApi";
import { identifyUser, resetUser, trackEvent } from "../services/analytics";
import { metricsCache } from "../services/metricsCache";
import { AuthSession } from "../types/expense";

type AuthStatus = "initializing" | "signed_out" | "signed_in";

interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
  refreshSession: () => Promise<void>;
  touchSession: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>("initializing");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshVersion = useRef(0);

  const refreshSession = async (): Promise<void> => {
    const version = ++refreshVersion.current;
    try {
      const nextSession = await authApi.getSession();
      if (version !== refreshVersion.current) return;
      if (nextSession) {
        await identifyUser(nextSession.email, nextSession).catch(() => undefined);
      }
      if (version !== refreshVersion.current) return;
      setSession(nextSession);
      setStatus(nextSession ? "signed_in" : "signed_out");
      setError(null);
    } catch (sessionError) {
      if (version !== refreshVersion.current) return;
      setSession(null);
      setStatus("signed_out");
      setError((sessionError as Error).message);
    }
  };

  useEffect(() => {
    void refreshSession();
    return () => { refreshVersion.current++; };
  }, []);

  const signIn = (): void => {
    trackEvent("sign_in");
    authApi.startLogin();
  };

  const signOut = (): void => {
    refreshVersion.current++;
    if (session?.email) metricsCache.clear(session.email);
    setSession(null);
    setStatus("signed_out");
    setError(null);
    resetUser();
    void authApi.logout().finally(() => trackEvent("sign_out"));
  };

  const touchSession = (): void => {
    if (!session) {
      return;
    }

    const now = Date.now();
    const updatedSession = {
      ...session,
      lastActivityAt: now,
    };

    setSession(updatedSession);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      error,
      signIn,
      signOut,
      refreshSession,
      touchSession,
      clearError: () => setError(null),
    }),
    [error, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
