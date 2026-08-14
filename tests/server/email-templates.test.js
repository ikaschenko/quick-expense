// @vitest-environment node
import { errorAlertEmail } from "../../app-server/email-templates.js";

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
});
