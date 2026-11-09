// @vitest-environment node
import crypto from "node:crypto";
import { getServiceAccountPrivateKey, normalizePrivateKey } from "../../app-server/google-client.js";

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const body = privateKey.replace(/-----[A-Z ]+-----|\s/g, "");

describe("normalizePrivateKey", () => {
  it("should leave a well-formed PEM unchanged", () => {
    expect(normalizePrivateKey(privateKey)).toBe(privateKey);
  });

  it.each([
    ["literal backslash-n sequences", privateKey.trimEnd().replaceAll("\n", "\\n")],
    ["literal backslash-n with trailing one", privateKey.replaceAll("\n", "\\n")],
    ["double quotes", `"${privateKey}"`],
    ["single quotes with escaped newlines", `'${privateKey.replaceAll("\n", "\\n")}'`],
    ["CRLF line endings", privateKey.replaceAll("\n", "\r\n")],
    ["newlines collapsed to spaces", privateKey.trimEnd().replaceAll("\n", " ")],
    ["surrounding whitespace", `  \n${privateKey}\n  `],
    ["a single line with no separators", `-----BEGIN PRIVATE KEY-----${body}-----END PRIVATE KEY-----`],
  ])("should restore a valid PEM from %s", (_label, mangled) => {
    expect(normalizePrivateKey(mangled)).toBe(privateKey);
  });

  it("should wrap the base64 body at 64 characters", () => {
    const lines = normalizePrivateKey(`-----BEGIN PRIVATE KEY-----${body}-----END PRIVATE KEY-----`).split("\n");
    expect(lines.slice(1, -3).every((line) => line.length === 64)).toBe(true);
  });

  it("should preserve the PEM label", () => {
    const result = normalizePrivateKey('"-----BEGIN RSA PRIVATE KEY-----\\nAAAA\\n-----END RSA PRIVATE KEY-----\\n"');
    expect(result).toBe("-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n");
  });

  it.each([["", ""], ["  garbage  ", "garbage"], ["-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----"]])(
    "should return trimmed input when there is no PEM block: %j",
    (input, expected) => {
      expect(normalizePrivateKey(input)).toBe(expected);
    },
  );
});

describe("getServiceAccountPrivateKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return the normalized PEM for a mangled but valid env value", () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", `"${privateKey.replaceAll("\n", "\\n")}"`);
    expect(getServiceAccountPrivateKey()).toBe(privateKey);
  });

  it("should throw when the env var is missing", () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "");
    expect(() => getServiceAccountPrivateKey()).toThrow("Missing environment variable: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  });

  it.each(["not-a-key", "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----"])(
    "should throw without echoing the value for an unparseable key: %j",
    (value) => {
      vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", value);
      expect(() => getServiceAccountPrivateKey()).toThrow("is not a valid PEM private key");
      expect(() => getServiceAccountPrivateKey()).not.toThrow(value);
    },
  );
});
