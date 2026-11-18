// @vitest-environment node
import { injectPosthogKey, serializeError, getAnalyticsKey, hashAnalyticsIdentity } from "../../app-server/utils.js";

describe("injectPosthogKey", () => {
  const html = "<html><head><title>QE</title></head><body></body></html>";

  it("should insert a posthog-key meta tag before </head> for a valid key", () => {
    expect(injectPosthogKey(html, "phc_Abc123")).toBe(
      '<html><head><title>QE</title><meta name="posthog-key" content="phc_Abc123" />\n</head><body></body></html>',
    );
  });

  it.each([undefined, "", "abc123", "phc_", 'phc_x"><script>alert(1)</script>', "phc_abc def"])(
    "should return the HTML unchanged for missing or invalid key %j",
    (key) => {
      expect(injectPosthogKey(html, key)).toBe(html);
    },
  );
});

describe("getAnalyticsKey", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([[" phc_Abc123 ", "phc_Abc123"], ["", null], ["abc123", null], ['phc_x"y', null]])(
    "should resolve %j to %j",
    (value, expected) => {
      vi.stubEnv("VITE_POSTHOG_KEY", value);
      expect(getAnalyticsKey()).toBe(expected);
    },
  );
});

describe("hashAnalyticsIdentity", () => {
  it("should hash the trimmed lowercase email like the browser does", () => {
    // sha256("user@example.com")
    const expected = "b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514";
    expect(hashAnalyticsIdentity("  User@Example.com ")).toBe(expected);
  });
});

describe("serializeError", () => {
  it("returns the message and stack for an Error instance", () => {
    const error = new Error("boom");

    expect(serializeError(error)).toEqual({ message: "boom", stack: error.stack });
  });

  it("falls back to a stringified message with an undefined stack for a non-Error throwable", () => {
    expect(serializeError("plain string")).toEqual({ message: "plain string", stack: undefined });
    expect(serializeError({ code: 42 })).toEqual({ message: "[object Object]", stack: undefined });
  });
});
