import landingHtml from "../../landing/index.html?raw";

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
  register: vi.fn(),
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
  posthogMock.capture.mockReturnValue({});
  localStorage.clear();
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

  it("should share the anonymous ID across subdomains and prefix pageview paths via before_send", async () => {
    setMetaKey("phc_meta");
    const { initAnalytics, prefixPathWithHost } = await loadAnalytics();

    initAnalytics();

    expect(posthogMock.init).toHaveBeenCalledWith(
      "phc_meta",
      expect.objectContaining({ cross_subdomain_cookie: true, cookieWinsOnConflict: true, before_send: prefixPathWithHost }),
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

describe("prefixPathWithHost", () => {
  it.each(["$pageview", "$pageleave"])("should prefix $pathname with $host on %s", async (name) => {
    const { prefixPathWithHost } = await loadAnalytics();

    const result = prefixPathWithHost({ event: name, properties: { $host: "app.q-expense.com", $pathname: "/home" } });

    expect(result?.properties?.$pathname).toBe("app.q-expense.com/home");
  });

  it("should leave custom events untouched", async () => {
    const { prefixPathWithHost } = await loadAnalytics();

    const result = prefixPathWithHost({ event: "expense_added", properties: { $host: "h", $pathname: "/add" } });

    expect(result?.properties?.$pathname).toBe("/add");
  });

  it("should leave pageviews without host or pathname untouched and pass through null", async () => {
    const { prefixPathWithHost } = await loadAnalytics();

    const noHost = prefixPathWithHost({ event: "$pageview", properties: { $pathname: "/home" } });

    expect(noHost?.properties?.$pathname).toBe("/home");
    expect(prefixPathWithHost(null)).toBeNull();
  });
});

describe("landing analytics configuration", () => {
  it("shares the app's cookie settings without tagging internal CTA links", () => {
    const landing = new DOMParser().parseFromString(landingHtml, "text/html");
    const source = Array.from(landing.scripts).find((script) => script.textContent?.includes("__POSTHOG_KEY__"))!.textContent!;
    const script = { onload: undefined as (() => void) | undefined };
    const appendChild = vi.fn();
    new Function("window", "document", source.replace("__POSTHOG_KEY__", "phc_test"))(
      { posthog: posthogMock }, { createElement: () => script, head: { appendChild } },
    );
    expect(appendChild).toHaveBeenCalledWith(script);
    script.onload!();
    expect(posthogMock.init).toHaveBeenCalledWith("phc_test", expect.objectContaining({
      cross_subdomain_cookie: true, cookieWinsOnConflict: true, capture_pageview: true,
    }));
    const links = Array.from(landing.querySelectorAll<HTMLAnchorElement>('a[href^="https://app.q-expense.com"]'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(new URL(link.href).searchParams.has("utm_source")).toBe(false);
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
  const session = {
    email: "user@example.com", givenName: null, picture: null,
    lastAuthenticatedAt: 1, lastActivityAt: 1,
    isGuest: false, guestAccessLevel: null, ownerEmail: null, configStatus: "ok",
    authentication: { id: "login-id", isNewUser: true, signupId: "signup-id", timestamp: 1000 },
  } satisfies import("../../app-web/types/expense").AuthSession;

  it("identifies before reporting signup and suppresses repeated session checks and reloads", async () => {
    setMetaKey("phc_meta");
    let analytics = await loadAnalytics();
    analytics.initAnalytics();

    await analytics.identifyUser(session.email, session);
    expect(posthogMock.identify.mock.invocationCallOrder[0]).toBeLessThan(posthogMock.capture.mock.invocationCallOrder[0]);
    expect(posthogMock.capture.mock.calls).toEqual([
      ["sign_in_completed", { account_type: "owner", access_level: "edit" }, { uuid: "login-id", timestamp: new Date(1000) }],
      ["user_signed_up", { account_type: "owner", access_level: "edit" }, { uuid: "signup-id", timestamp: new Date(1000) }],
    ]);
    await analytics.identifyUser(session.email, session);
    analytics = await loadAnalytics();
    analytics.initAnalytics();
    await analytics.identifyUser(session.email, session);
    expect(posthogMock.capture).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("qe_analytics_auth")).not.toContain(session.email);
  });

  it("reports another successful login without turning an existing guest into a signup", async () => {
    setMetaKey("phc_meta");
    const analytics = await loadAnalytics();
    analytics.initAnalytics();
    await analytics.identifyUser(session.email, session);
    posthogMock.capture.mockClear();
    await analytics.identifyUser(session.email, {
      ...session, isGuest: true, guestAccessLevel: "view",
      authentication: { id: "next-login", isNewUser: false, signupId: null, timestamp: 2000 },
    });
    expect(posthogMock.capture.mock.calls).toEqual([
      ["sign_in_completed", { account_type: "guest", access_level: "view" }, { uuid: "next-login", timestamp: new Date(2000) }],
    ]);
    expect(posthogMock.register).toHaveBeenLastCalledWith({ account_type: "guest", access_level: "view" });
  });

  it("identifies legacy sessions without manufacturing login or signup events", async () => {
    setMetaKey("phc_meta");
    const analytics = await loadAnalytics();
    analytics.initAnalytics();
    await analytics.identifyUser(session.email, { ...session, authentication: null });
    expect(posthogMock.identify).toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("keeps stable event IDs when storage is unavailable", async () => {
    setMetaKey("phc_meta");
    let analytics = await loadAnalytics();
    analytics.initAnalytics();
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    try {
      await analytics.identifyUser(session.email, session);
      await analytics.identifyUser(session.email, session);
      expect(posthogMock.capture).toHaveBeenCalledTimes(2);
      analytics = await loadAnalytics();
      analytics.initAnalytics();
      await analytics.identifyUser(session.email, session);
      expect(posthogMock.capture.mock.calls[0]).toEqual(posthogMock.capture.mock.calls[2]);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it("retries events the SDK did not accept without writing a receipt", async () => {
    setMetaKey("phc_meta");
    const analytics = await loadAnalytics();
    analytics.initAnalytics();
    posthogMock.capture.mockReturnValueOnce(undefined);
    await analytics.identifyUser(session.email, session);
    expect(localStorage.getItem("qe_analytics_auth")).toBeNull();
    await analytics.identifyUser(session.email, session);
    expect(posthogMock.capture.mock.calls.map(([name]) => name)).toEqual(["sign_in_completed", "sign_in_completed", "user_signed_up"]);
  });

  it("retries a partially accepted signup with the same event UUIDs", async () => {
    setMetaKey("phc_meta");
    const analytics = await loadAnalytics();
    analytics.initAnalytics();
    posthogMock.capture.mockReturnValueOnce({}).mockReturnValueOnce(undefined);
    await analytics.identifyUser(session.email, session);
    expect(localStorage.getItem("qe_analytics_auth")).toBeNull();
    await analytics.identifyUser(session.email, session);
    expect(posthogMock.capture.mock.calls[0]).toEqual(posthogMock.capture.mock.calls[2]);
    expect(posthogMock.capture.mock.calls[1]).toEqual(posthogMock.capture.mock.calls[3]);
  });

  it("does not identify or capture after logout interrupts hashing", async () => {
    setMetaKey("phc_meta");
    const analytics = await loadAnalytics();
    analytics.initAnalytics();
    const pending = analytics.identifyUser(session.email, session);
    analytics.resetUser();
    await pending;
    expect(posthogMock.identify).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it("does not let analytics failures escape into application workflows", async () => {
    setMetaKey("phc_meta");
    const analytics = await loadAnalytics();
    posthogMock.init.mockImplementationOnce(() => { throw new Error("init"); });
    expect(() => analytics.initAnalytics()).not.toThrow();
    analytics.initAnalytics();
    posthogMock.identify.mockImplementationOnce(() => { throw new Error("identify"); });
    await expect(analytics.identifyUser(session.email, session)).resolves.toBeUndefined();
    posthogMock.capture.mockImplementationOnce(() => { throw new Error("capture"); });
    expect(() => analytics.trackEvent("expense_added")).not.toThrow();
    posthogMock.reset.mockImplementationOnce(() => { throw new Error("reset"); });
    expect(() => analytics.resetUser()).not.toThrow();
  });

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
