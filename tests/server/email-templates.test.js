// @vitest-environment node
import { errorAlertEmail, warningDigestEmail } from "../../app-server/email-templates.js";
import { requestSummary } from "../../app-server/request-context.js";

describe("errorAlertEmail", () => {
  it("renders the stack trace HTML-escaped inside a <pre> block, preserving line breaks", () => {
    const stack = "TypeError: boom\n    at <anonymous>";

    const { html, text } = errorAlertEmail({ message: "boom", event: "test_error", stack });

    expect(html).toContain("<pre");
    expect(html).toContain("TypeError: boom\n    at &lt;anonymous&gt;");
    expect(text).toContain("Stack trace:");
    expect(text).toContain(stack);
  });

  it("omits the stack trace section when no stack is provided", () => {
    const { html, text } = errorAlertEmail({ message: "boom", event: "test_error" });

    expect(html).not.toContain("<pre");
    expect(text).not.toContain("Stack trace:");
  });

  it("renders request, client and error-type details for an anonymous request", () => {
    const { subject, html, text } = errorAlertEmail({
      message: "unhandled_request_error",
      event: "unhandled_request_error",
      error: "Failed to decode param",
      errorType: "URIError",
      method: "GET",
      path: "/backend/%%32%65env",
      statusCode: 500,
      clientIp: "203.0.113.7",
      userAgent: "<script>",
      userId: 0,
    });

    expect(subject).toBe("[QuickExpense Alert] Error: unhandled_request_error — GET /backend/%%32%65env (URIError)");
    expect(text).not.toContain("Message:");
    expect(text).toContain("Error detail: URIError: Failed to decode param");
    expect(text).toContain("Request: GET /backend/%%32%65env — 500");
    expect(text).toContain("User ID: anonymous (not signed in)");
    expect(text).toContain("Client IP: 203.0.113.7");
    expect(html).toContain("User agent:</strong> &lt;script&gt;");
  });

  it("keeps a distinct message and a real user id", () => {
    const { text } = errorAlertEmail({ message: "createSpreadsheet: copy failed", event: "create_spreadsheet_stage_failed", userId: 42 });

    expect(text).toContain("Message: createSpreadsheet: copy failed");
    expect(text).toContain("User ID: 42");
  });

  it("keeps the subject on one bounded line even for hostile paths", () => {
    const { subject } = errorAlertEmail({ event: "e", method: "GET", path: `/a\r\nBcc: x@y.z${"a".repeat(300)}` });

    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual(201);
  });

  it.each([
    [0, false],
    [3, true],
  ])("shows the suppressed-alert line only when suppressedCount=%s > 0", (suppressedCount, shown) => {
    const { text } = errorAlertEmail({ event: "e", suppressedCount });

    expect(text.includes(`Suppressed: ${suppressedCount} more error(s)`)).toBe(shown);
  });
});

describe("warningDigestEmail", () => {
  it("includes the request path in samples when available", () => {
    const { text } = warningDigestEmail({ count: 2, since: "t", samples: [{ message: "client_request_error", userId: 0, path: "/x" }, { message: "w", userId: 1 }] });

    expect(text).toContain("- client_request_error [/x] (userId: 0)");
    expect(text).toContain("- w (userId: 1)");
  });
});

describe("requestSummary", () => {
  it("prefers Fly-Client-IP, omits the query string and truncates long values", () => {
    const headers = { "fly-client-ip": "203.0.113.7", "user-agent": "u".repeat(300) };
    const summary = requestSummary({ method: "GET", path: "/api/auth/callback", originalUrl: "/api/auth/callback?code=secret", ip: "10.0.0.1", get: (name) => headers[name] });

    expect(summary).toMatchObject({ method: "GET", path: "/api/auth/callback", clientIp: "203.0.113.7" });
    expect(summary.userAgent).toHaveLength(201);
    expect(JSON.stringify(summary)).not.toContain("secret");
  });

  it("falls back to req.ip when Fly-Client-IP is absent", () => {
    expect(requestSummary({ method: "POST", path: "/", ip: "10.0.0.1", get: () => undefined }).clientIp).toBe("10.0.0.1");
  });
});
