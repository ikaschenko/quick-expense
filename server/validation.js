/**
 * Validates the request body for POST /api/config/mapping.
 * Returns { valid: true } or { valid: false, message: string }.
 */
export function validateMappingRequestBody(body) {
  if (body?.confirmed !== true) {
    return { valid: false, message: "Explicit confirmation is required to save a column mapping." };
  }
  const mapping = body?.mapping;
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return { valid: false, message: "A mapping object is required." };
  }
  return { valid: true };
}
