import posthog from "posthog-js";

let enabled = false;

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

export function initAnalytics(): void {
  const key = resolveKey();
  if (!key) return;

  posthog.init(key, {
    api_host: "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
  });
  enabled = true;
}

export function identifyUser(email: string): void {
  if (!enabled) return;
  void hashEmail(email).then((id) => posthog.identify(id));
}

export function resetUser(): void {
  if (!enabled) return;
  posthog.reset();
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  if (!enabled) return;
  posthog.capture(name, props);
}
