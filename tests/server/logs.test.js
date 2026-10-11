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
    vi.stubGlobal("fetch", vi.fn((url) => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(String(url).includes("/api/admin/logs/files")
        ? { files: [{ name: "combined-2024-01-01.log", size: 100 }] }
        : { entries: [] }),
    })));
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

  it("should reload the tail with the search query when Enter is pressed", async () => {
    await import("../../app-server/views/logs.js");
    await vi.waitFor(() => expect(document.getElementById("status").textContent).toBe("0 entries"));
    fetch.mockClear();
    const queryInput = document.getElementById("q");
    queryInput.value = "request failed";
    queryInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    await vi.waitFor(() => expect(document.getElementById("status").textContent).toBe("0 entries"));
    expect(fetch).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(fetch.mock.calls[0][0], "http://localhost");
    expect(requestUrl.pathname).toBe("/api/admin/logs/tail");
    expect(requestUrl.searchParams.get("q")).toBe("request failed");
  });

  it("should not reload the tail for a non-Enter key", async () => {
    await import("../../app-server/views/logs.js");
    await vi.waitFor(() => expect(document.getElementById("status").textContent).toBe("0 entries"));
    fetch.mockClear();

    document.getElementById("q").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(document.getElementById("status").textContent).toBe("0 entries");
  });

  it("should not load a tail when no log file is available", async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ files: [] }) });
    await import("../../app-server/views/logs.js");
    await vi.waitFor(() => expect(document.getElementById("file").innerHTML).toBe(""));
    fetch.mockClear();

    document.getElementById("q").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(fetch).not.toHaveBeenCalled();
    expect(document.getElementById("status").textContent).toBe("");
  });

  it.each(["network", "http"])("should display a %s failure during initialization", async (failure) => {
    if (failure === "network") fetch.mockRejectedValue(new Error("Files unavailable"));
    else fetch.mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({ message: "Files unavailable" }) });

    await import("../../app-server/views/logs.js");

    await vi.waitFor(() => expect(document.getElementById("status").textContent).toBe("Files unavailable"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(document.getElementById("entries").innerHTML).toBe("");
  });

  it.each(["network", "http"])("should display a %s failure and clear entries on Enter refresh", async (failure) => {
    await import("../../app-server/views/logs.js");
    await vi.waitFor(() => expect(document.getElementById("status").textContent).toBe("0 entries"));
    document.getElementById("entries").textContent = "Previous entries";
    if (failure === "network") fetch.mockRejectedValue(new Error("Tail unavailable"));
    else fetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ message: "Tail unavailable" }) });

    document.getElementById("q").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    await vi.waitFor(() => expect(document.getElementById("status").textContent).toBe("Tail unavailable"));
    expect(document.getElementById("entries").innerHTML).toBe("");
  });
});
