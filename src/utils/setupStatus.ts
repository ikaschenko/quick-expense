export type SetupBannerKind = "loading" | "configured" | "needs-setup" | "invalid";

export interface SetupBannerState {
  kind: SetupBannerKind;
  variant: "info" | "success" | "error";
  message: string;
}

interface ResolveSetupBannerStateInput {
  isConfigLoading: boolean;
  hasConfig: boolean;
  hasInvalidSetup: boolean;
}

export function resolveSetupBannerState({
  isConfigLoading,
  hasConfig,
  hasInvalidSetup,
}: ResolveSetupBannerStateInput): SetupBannerState {
  if (isConfigLoading) {
    return {
      kind: "loading",
      variant: "info",
      message: "Checking your current setup status...",
    };
  }

  if (hasInvalidSetup) {
    return {
      kind: "invalid",
      variant: "error",
      message: "Setup needs attention. Please update your spreadsheet link and save again.",
    };
  }

  if (hasConfig) {
    return {
      kind: "configured",
      variant: "success",
      message: "You have already set up your settings. No action needed. You can apply changes anytime.",
    };
  }

  return {
    kind: "needs-setup",
    variant: "error",
    message: "Please choose an option below and fill in the required fields.",
  };
}