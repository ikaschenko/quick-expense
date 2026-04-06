import { resolveSetupBannerState } from "../src/utils/setupStatus";

describe("setup status banner resolver", () => {
  it("returns info banner while config status is loading", () => {
    const state = resolveSetupBannerState({
      isConfigLoading: true,
      hasConfig: false,
      hasInvalidSetup: false,
    });

    expect(state.kind).toBe("loading");
    expect(state.variant).toBe("info");
    expect(state.message).toContain("Checking your current setup status");
  });

  it("returns success banner when setup is already configured", () => {
    const state = resolveSetupBannerState({
      isConfigLoading: false,
      hasConfig: true,
      hasInvalidSetup: false,
    });

    expect(state.kind).toBe("configured");
    expect(state.variant).toBe("success");
    expect(state.message).toContain("No action needed");
  });

  it("returns action-required banner when setup is not configured", () => {
    const state = resolveSetupBannerState({
      isConfigLoading: false,
      hasConfig: false,
      hasInvalidSetup: false,
    });

    expect(state.kind).toBe("needs-setup");
    expect(state.variant).toBe("error");
    expect(state.message).toContain("Please choose an option below");
  });

  it("returns separate invalid banner when setup needs correction", () => {
    const state = resolveSetupBannerState({
      isConfigLoading: false,
      hasConfig: false,
      hasInvalidSetup: true,
    });

    expect(state.kind).toBe("invalid");
    expect(state.variant).toBe("error");
    expect(state.message).toContain("Setup needs attention");
  });

  it("prioritizes loading over other states", () => {
    const state = resolveSetupBannerState({
      isConfigLoading: true,
      hasConfig: true,
      hasInvalidSetup: true,
    });

    expect(state.kind).toBe("loading");
  });
});