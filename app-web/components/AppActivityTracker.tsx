import { useEffect, useRef, type JSX } from "react";
import { useLocation } from "react-router-dom";
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

function eventIdFor(key: string): string {
  const storageKey = `qe-activity:${key}`;
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      const pending = JSON.parse(saved) as { id: string; createdAt: number };
      if (Date.now() - pending.createdAt <= 120_000) return pending.id;
    }
    const id = crypto.randomUUID();
    sessionStorage.setItem(storageKey, JSON.stringify({ id, createdAt: Date.now() }));
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

async function withActivityLock<T>(action: () => Promise<T>): Promise<T> {
  if (navigator.locks) return navigator.locks.request("quickexpense-activity-bootstrap", action);

  const key = "qe-activity-lock";
  const token = crypto.randomUUID();
  let storage: Storage;
  try { storage = localStorage; } catch { return action(); }
  let acquired = false;
  while (!acquired) {
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

export function AppActivityTracker(): null {
  const location = useLocation();
  const { status, session } = useAuth();
  const lastArrival = useRef("");

  useEffect(() => {
    const screen = getScreen(location.pathname);
    if (status !== "signed_in" || !session || !screen || document.visibilityState !== "visible") return;
    if (screen === "admin" && !session.isAppAdmin) return;
    const arrivalKey = `${session.email.toLowerCase()}:${location.key}:${screen}`;
    if (lastArrival.current === arrivalKey) return;
    lastArrival.current = arrivalKey;
    const eventId = eventIdFor(arrivalKey);
    let retries = 0;

    const submit = async (): Promise<void> => {
      try {
        await withActivityLock(async () => {
          const { envelope } = await requestJson<{ envelope: string }>(`/api/activity/envelope?eventId=${encodeURIComponent(eventId)}&screen=${screen}`, { cache: "no-store" });
          await requestJson("/api/activity", { method: "POST", body: JSON.stringify({ eventId, screen, envelope }) });
        });
        try { sessionStorage.removeItem(`qe-activity:${arrivalKey}`); } catch { /* Storage is optional. */ }
      } catch {
        if (retries < 2 && document.visibilityState === "visible") {
          retries += 1;
          window.setTimeout(() => { if (document.visibilityState === "visible") void submit(); }, retries * 1500);
        }
      }
    };
    void submit();
  }, [location.key, location.pathname, session, status]);

  return null;
}
