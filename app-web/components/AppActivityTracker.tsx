import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { requestJson } from "../services/http";

function getScreen(pathname: string): string | null {
  if (pathname === "/home") return "home";
  if (pathname === "/setup") return "setup";
  if (pathname === "/add") return "add";
  if (pathname.startsWith("/edit/")) return "edit";
  if (pathname === "/history") return "history";
  if (pathname === "/admin") return "admin";
  return null;
}

interface Arrival {
  id: string;
  createdAt: number;
  envelope?: string;
}

function arrivalFor(key: string): Arrival {
  try {
    const saved = sessionStorage.getItem(`qe-activity:${key}`);
    if (saved) {
      const pending = JSON.parse(saved) as Arrival;
      if (typeof pending.id === "string" && Number.isFinite(pending.createdAt)) return pending;
    }
  } catch { /* Storage is optional. */ }
  return { id: crypto.randomUUID(), createdAt: Date.now() };
}

function saveArrival(key: string, arrival: Arrival): void {
  try { sessionStorage.setItem(`qe-activity:${key}`, JSON.stringify(arrival)); } catch { /* Storage is optional. */ }
}

async function withActivityLock<T>(deadline: number, action: () => Promise<T>): Promise<T | undefined> {
  if (navigator.locks) return navigator.locks.request("quickexpense-activity-bootstrap", action);

  const key = "qe-activity-lock";
  const token = crypto.randomUUID();
  let storage: Storage;
  try { storage = localStorage; } catch { return action(); }
  let acquired = false;
  while (!acquired) {
    if (Date.now() >= deadline) return;
    try {
      const current = storage.getItem(key);
      const expiry = current ? Number(current.split(":")[1]) : 0;
      if (!current || expiry < Date.now()) {
        storage.setItem(key, `${token}:${Date.now() + 10_000}`);
        acquired = storage.getItem(key)?.startsWith(`${token}:`) ?? false;
      }
    } catch { return action(); }
    if (!acquired) await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
  try { return await action(); }
  finally {
    if (storage.getItem(key)?.startsWith(`${token}:`)) storage.removeItem(key);
  }
}

export function AppActivityTracker({ eligible = true }: { eligible?: boolean }): null {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { status, session } = useAuth();
  const lastArrival = useRef("");
  const navigation = useRef({ path: location.pathname, key: location.key });
  // React Router gives state-only replacements a new key; they are not arrivals.
  if (navigation.current.path !== location.pathname || navigationType !== "REPLACE") {
    navigation.current = { path: location.pathname, key: location.key };
  }
  const arrivalLocationKey = navigation.current.key;

  useEffect(() => {
    const screen = getScreen(location.pathname);
    if (!eligible || status !== "signed_in" || !session || !screen || document.visibilityState !== "visible") return;
    if (screen === "admin" && !session.isAppAdmin) return;
    const arrivalKey = `${session.email.toLowerCase()}:${arrivalLocationKey}:${screen}`;
    if (lastArrival.current === arrivalKey) return;
    let cancelled = false;
    let timer: number;
    let retries = 0;
    const arrival = arrivalFor(arrivalKey);
    const deadline = arrival.createdAt + 120_000;
    const live = (): boolean => !cancelled && Date.now() < deadline && document.visibilityState === "visible";

    const submit = async (): Promise<void> => {
      if (!live()) return;
      try {
        await withActivityLock(deadline, async () => {
          if (!live()) return;
          if (!arrival.envelope) {
            const response = await requestJson<{ envelope: string }>(`/api/activity/envelope?eventId=${encodeURIComponent(arrival.id)}&screen=${screen}`, { cache: "no-store" });
            arrival.envelope = response.envelope;
            saveArrival(arrivalKey, arrival);
          }
          if (!live()) return;
          await requestJson("/api/activity", { method: "POST", body: JSON.stringify({ eventId: arrival.id, screen, envelope: arrival.envelope }) });
          try { sessionStorage.removeItem(`qe-activity:${arrivalKey}`); } catch { /* Storage is optional. */ }
        });
      } catch {
        if (retries < 2 && live()) {
          retries += 1;
          timer = window.setTimeout(() => { void submit(); }, retries * 1500);
        }
      }
    };
    // Wait for navigation effects/redirects to settle; cleanup cancels intermediates.
    timer = window.setTimeout(() => {
      if (!live()) return;
      lastArrival.current = arrivalKey;
      saveArrival(arrivalKey, arrival);
      void submit();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [arrivalLocationKey, eligible, location.pathname, session?.email, session?.isAppAdmin, status]);

  return null;
}
