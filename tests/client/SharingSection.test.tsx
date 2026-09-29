import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SharingSection } from "../../app-web/components/SharingSection";
import { SetupSharing } from "../../app-web/hooks/useSetupSharing";

function makeSharing(overrides: Partial<SetupSharing> = {}): SetupSharing {
  return {
    shares: [],
    loadError: null,
    actionError: null,
    actionBusy: false,
    newShareEmail: "",
    setNewShareEmail: vi.fn(),
    newShareLevel: "edit",
    setNewShareLevel: vi.fn(),
    addShare: vi.fn(),
    editingShareEmail: null,
    editShareLevel: "edit",
    setEditShareLevel: vi.fn(),
    startEditing: vi.fn(),
    cancelEditing: vi.fn(),
    updateShare: vi.fn(),
    removeShare: vi.fn(),
    ...overrides,
  };
}

describe("SharingSection", () => {
  it("hides the table when nothing is shared yet", () => {
    render(<SharingSection sharing={makeSharing()} />);
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lists each shared user with its access level", () => {
    const { container } = render(<SharingSection sharing={makeSharing({ shares: [{ guestEmail: "a@b.com", accessLevel: "view" }] })} />);
    expect(screen.getByText("a@b.com")).toBeTruthy();
    expect(container.querySelector(".sharing-table .config-mode-badge")?.textContent).toBe("View");
  });

  it("renders load and action errors", () => {
    render(<SharingSection sharing={makeSharing({ loadError: "Load failed", actionError: "Action failed" })} />);
    expect(screen.getByText("Load failed")).toBeTruthy();
    expect(screen.getByText("Action failed")).toBeTruthy();
  });

  it("starts editing a share row", () => {
    const sharing = makeSharing({ shares: [{ guestEmail: "a@b.com", accessLevel: "edit" }] });
    render(<SharingSection sharing={sharing} />);
    fireEvent.click(screen.getByLabelText("Edit a@b.com"));
    expect(sharing.startEditing).toHaveBeenCalledWith({ guestEmail: "a@b.com", accessLevel: "edit" });
  });

  it("removes a share row", () => {
    const sharing = makeSharing({ shares: [{ guestEmail: "a@b.com", accessLevel: "edit" }] });
    render(<SharingSection sharing={sharing} />);
    fireEvent.click(screen.getByLabelText("Remove a@b.com"));
    expect(sharing.removeShare).toHaveBeenCalledWith("a@b.com");
  });

  it("swaps the badge for a level selector while editing and saves the change", () => {
    const sharing = makeSharing({
      shares: [{ guestEmail: "a@b.com", accessLevel: "edit" }],
      editingShareEmail: "a@b.com",
    });
    render(<SharingSection sharing={sharing} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Save"));
    expect(sharing.updateShare).toHaveBeenCalledWith("a@b.com");
  });

  it("submits the add-user form", () => {
    const sharing = makeSharing({ newShareEmail: "new@b.com" });
    const { container } = render(<SharingSection sharing={sharing} />);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(sharing.addShare).toHaveBeenCalled();
  });

  it("disables the add-user controls while an action is in flight", () => {
    render(<SharingSection sharing={makeSharing({ actionBusy: true })} />);
    expect(screen.getByRole("button", { name: /Add user/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByPlaceholderText("user@gmail.com").hasAttribute("disabled")).toBe(true);
  });
});
