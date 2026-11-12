import posthog from "posthog-js";
import type { AuthSession } from "../types/expense";

let enabled = false;
let identityVersion = 0;
let authenticationReceipt: string | null = null;
const AUTH_RECEIPT_KEY = "qe_analytics_auth";

// Production key is injected at runtime by the server as a <meta> tag; the env var is a local-dev fallback.
function resolveKey(): string | undefined {
  const envKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const metaKey = document.querySelector<HTMLMetaElement>('meta[name="posthog-key"]')?.content;
  const key = envKey || metaKey;
  return key?.startsWith("phc_") ? key : undefined;
}

async function hashEmail(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Landing and app share one PostHog project; prefixing $pathname with the host keeps their paths apart in Paths.
export function prefixPathWithHost<T extends { event: string; properties?: Record<string, unknown> }>(
  event: T | null,
): T | null {
  const props = event?.properties;
  if (event && props && (event.event === "$pageview" || event.event === "$pageleave")) {
    const { $host: host, $pathname: path } = props;
    if (typeof host === "string" && typeof path === "string") props.$pathname = `${host}${path}`;
  }
  return event;
}

export function initAnalytics(): void {
  const key = resolveKey();
  if (!key) return;

  try {
    posthog.init(key, {
      api_host: "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: true,
      cross_subdomain_cookie: true,
      cookieWinsOnConflict: true,
      before_send: prefixPathWithHost,
    });
    enabled = true;
  } catch {
    enabled = false;
  }
}

export async function identifyUser(email: string, session?: AuthSession): Promise<void> {
  if (!enabled) return;
  const version = ++identityVersion;
  try {
    const id = await hashEmail(email);
    if (version !== identityVersion) return;
    if (!session) {
      posthog.identify(id);
      return;
    }
    const properties = {
      account_type: session.isGuest ? "guest" : "owner",
      access_level: session.guestAccessLevel ?? "edit",
    };
    posthog.identify(id, properties);
    posthog.register(properties);
    const authentication = session.authentication;
    if (!authentication) return;
    const receipt = `${id}:${authentication.id}`;
    if (authenticationReceipt === receipt) return;
    try {
      if (localStorage.getItem(AUTH_RECEIPT_KEY) === receipt) return;
    } catch {}
    const timestamp = new Date(authentication.timestamp);
    if (!posthog.capture("sign_in_completed", properties, { uuid: authentication.id, timestamp })) return;
    if (authentication.isNewUser && authentication.signupId) {
      if (!posthog.capture("user_signed_up", properties, { uuid: authentication.signupId, timestamp })) return;
    }
    authenticationReceipt = receipt;
    try {
      localStorage.setItem(AUTH_RECEIPT_KEY, receipt);
    } catch {}
  } catch {}
}

export function resetUser(): void {
  identityVersion++;
  if (!enabled) return;
  try {
    posthog.reset();
  } catch {}
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    posthog.capture(name, props);
  } catch {}
}
