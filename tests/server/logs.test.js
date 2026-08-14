// @vitest-environment jsdom
describe("logs entry rendering", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="file"></select>
      <select id="level"><option value="">All levels</option></select>
      <input type="text" id="q" />
      <input type="number" id="lines" value="200" />
      <div id="status"></div>
      <div id="entries"></div>
      <button id="refresh"></button>
    `;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("HTML-escapes log entry content instead of injecting raw markup", async () => {
    const maliciousEntry = { level: "error", timestamp: "2024-01-01T00:00:00Z", message: "<img src=x onerror=alert(1)>" };
    const fetchMock = vi.fn((url) => {
      if (String(url).includes("/api/admin/logs/files")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ files: [{ name: "combined-2024-01-01.log", size: 100 }] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [maliciousEntry] }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    await import("../../app-server/views/logs.js");

    const entriesEl = document.getElementById("entries");
    await vi.waitFor(() => {
      if (!entriesEl.innerHTML) throw new Error("entries not rendered yet");
    });

    expect(entriesEl.innerHTML).not.toContain("<img");
    expect(entriesEl.innerHTML).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
