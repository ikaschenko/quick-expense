// @vitest-environment node
import { serializeError } from "../../app-server/utils.js";

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
