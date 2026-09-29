import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { GuestUnlinkBanner } from "../../app-web/components/GuestUnlinkBanner";

const { mockRefreshSession, mockNavigate, mockResetGuestConfig } = vi.hoisted(() => ({
  mockRefreshSession: vi.fn(),
  mockNavigate: vi.fn(),
  mockResetGuestConfig: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../app-web/contexts/AuthContext", () => ({
  useAuth: () => ({ refreshSession: mockRefreshSession }),
}));

vi.mock("../../app-web/services/sharingApi", () => ({
  sharingApi: { resetGuestConfig: mockResetGuestConfig },
}));

function renderBanner() {
  return render(
    <MemoryRouter>
      <GuestUnlinkBanner ownerEmail="owner@example.com" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockResetGuestConfig.mockReset();
  mockRefreshSession.mockReset();
  mockNavigate.mockReset();
});

describe("GuestUnlinkBanner", () => {
  it("names the owner and keeps the dialog closed initially", () => {
    renderBanner();
    expect(screen.getByText(/This setup has been shared with you by/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the confirmation dialog on Unlink", () => {
    renderBanner();
    fireEvent.click(screen.getByRole("button", { name: /Unlink/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes the dialog without calling the API on Cancel", () => {
    renderBanner();
    fireEvent.click(screen.getByRole("button", { name: /Unlink/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockResetGuestConfig).not.toHaveBeenCalled();
  });

  it("resets the guest config, refreshes the session and redirects on confirm", async () => {
    mockResetGuestConfig.mockResolvedValue(undefined);
    mockRefreshSession.mockResolvedValue(undefined);

    renderBanner();
    fireEvent.click(screen.getByRole("button", { name: /Unlink/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, unlink/i }));

    await waitFor(() => expect(mockResetGuestConfig).toHaveBeenCalledTimes(1));
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/setup");
  });

  it("keeps the dialog open and shows the error when unlinking fails", async () => {
    mockResetGuestConfig.mockRejectedValue(new Error("Network error"));

    renderBanner();
    fireEvent.click(screen.getByRole("button", { name: /Unlink/i }));
    fireEvent.click(screen.getByRole("button", { name: /Yes, unlink/i }));

    await waitFor(() => expect(screen.getByText("Network error")).toBeTruthy());
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
