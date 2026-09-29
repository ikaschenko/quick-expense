import { vi } from "vitest";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: posthogMock }));

async function loadAnalytics() {
  vi.resetModules();
  return import("../../app-web/services/analytics");
}

function setMetaKey(content: string): void {
  const meta = document.createElement("meta");
  meta.name = "posthog-key";
  meta.content = content;
  document.head.appendChild(meta);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_POSTHOG_KEY", "");
  document.head.querySelectorAll('meta[name="posthog-key"]').forEach((el) => el.remove());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("initAnalytics", () => {
  it("should init PostHog with history_change pageviews and pageleave using the meta key", async () => {
    setMetaKey("phc_meta");
    const { initAnalytics } = await loadAnalytics();

    initAnalytics();

    expect(posthogMock.init).toHaveBeenCalledWith(
      "phc_meta",
      expect.objectContaining({ capture_pageview: "history_change", capture_pageleave: true, autocapture: false }),
    );
  });

  it("should prefer the env key over the meta key", async () => {
    vi.stubEnv("VITE_POSTHOG_KEY", "phc_env");
    setMetaKey("phc_meta");
    const { initAnalytics } = await loadAnalytics();

    initAnalytics();

    expect(posthogMock.init).toHaveBeenCalledWith("phc_env", expect.any(Object));
  });

  it.each(["", "not_a_key", "${VITE_POSTHOG_KEY}"])("should not init when the key is %j", async (key) => {
    if (key) setMetaKey(key);
    const { initAnalytics } = await loadAnalytics();

    initAnalytics();

    expect(posthogMock.init).not.toHaveBeenCalled();
  });
});

describe("when analytics is disabled", () => {
  it("should not call PostHog for identify, reset, or events", async () => {
    const { initAnalytics, identifyUser, resetUser, trackEvent } = await loadAnalytics();
    initAnalytics();

    identifyUser("a@b.com");
    resetUser();
    trackEvent("sign_in");

    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.reset).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });
});

describe("when analytics is enabled", () => {
  it("should identify with a SHA-256 hash of the normalized email, never the raw email", async () => {
    setMetaKey("phc_meta");
    const { initAnalytics, identifyUser } = await loadAnalytics();
    initAnalytics();

    identifyUser("  User@Example.com ");

    await vi.waitFor(() => expect(posthogMock.identify).toHaveBeenCalledTimes(1));
    // sha256("user@example.com")
    expect(posthogMock.identify).toHaveBeenCalledWith(
      "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514",
    );
  });

  it("should forward events and reset to PostHog", async () => {
    setMetaKey("phc_meta");
    const { initAnalytics, resetUser, trackEvent } = await loadAnalytics();
    initAnalytics();

    trackEvent("expense_added", { currency: "EUR" });
    resetUser();

    expect(posthogMock.capture).toHaveBeenCalledWith("expense_added", { currency: "EUR" });
    expect(posthogMock.reset).toHaveBeenCalledTimes(1);
  });
});
