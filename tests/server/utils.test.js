// @vitest-environment node
import { injectPosthogKey, serializeError } from "../../app-server/utils.js";

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
