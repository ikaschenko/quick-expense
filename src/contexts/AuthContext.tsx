import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authApi } from "../services/authApi";
import { identifyUser, resetUser, trackEvent } from "../services/analytics";
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

  const refreshSession = async (): Promise<void> => {
    try {
      const nextSession = await authApi.getSession();
      setSession(nextSession);
      setStatus(nextSession ? "signed_in" : "signed_out");
      setError(null);
      if (nextSession) {
        identifyUser(nextSession.email);
      }
    } catch (sessionError) {
      setSession(null);
      setStatus("signed_out");
      setError((sessionError as Error).message);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  const signIn = (): void => {
    trackEvent("sign_in");
    authApi.startLogin();
  };

  const signOut = (): void => {
    void authApi.logout().finally(() => {
      setSession(null);
      setStatus("signed_out");
      setError(null);
      resetUser();
      trackEvent("sign_out");
    });
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
