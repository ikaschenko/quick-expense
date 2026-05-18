// @vitest-environment node
let validateMappingRequestBody;

beforeAll(async () => {
  ({ validateMappingRequestBody } = await import("../server/validation.js"));
});

describe("validateMappingRequestBody", () => {
  it("returns invalid when body is undefined", () => {
    expect(validateMappingRequestBody(undefined)).toEqual({
      valid: false,
      message: "Explicit confirmation is required to save a column mapping.",
    });
  });

  it("returns invalid when confirmed is false", () => {
    expect(validateMappingRequestBody({ confirmed: false, mapping: { USD: "Amount" } })).toEqual({
      valid: false,
      message: "Explicit confirmation is required to save a column mapping.",
    });
  });

  it("returns invalid when confirmed is true but mapping is missing", () => {
    expect(validateMappingRequestBody({ confirmed: true })).toEqual({
      valid: false,
      message: "A mapping object is required.",
    });
  });

  it("returns invalid when confirmed is true but mapping is an array", () => {
    expect(validateMappingRequestBody({ confirmed: true, mapping: ["USD"] })).toEqual({
      valid: false,
      message: "A mapping object is required.",
    });
  });

  it("returns valid when confirmed is true and mapping is a non-empty object", () => {
    expect(validateMappingRequestBody({ confirmed: true, mapping: { USD: "Amount" } })).toEqual({
      valid: true,
    });
  });

  it("returns valid when confirmed is true and mapping is an empty object", () => {
    expect(validateMappingRequestBody({ confirmed: true, mapping: {} })).toEqual({
      valid: true,
    });
  });
});
