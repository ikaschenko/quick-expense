import posthog from "posthog-js";

export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;

  posthog.init(key, {
    api_host: "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
  });
}

export function identifyUser(email: string): void {
  posthog.identify(email);
}

export function resetUser(): void {
  posthog.reset();
}

export function trackPageView(path: string): void {
  posthog.capture("$pageview", { $current_url: path });
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  posthog.capture(name, props);
}
