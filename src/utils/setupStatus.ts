export type SetupBannerKind = "loading" | "configured" | "needs-setup" | "invalid" | "load-error";

export interface SetupBannerState {
  kind: SetupBannerKind;
  variant: "info" | "success" | "error";
  message: string;
}

interface ResolveSetupBannerStateInput {
  isConfigLoading: boolean;
  hasConfig: boolean;
  hasInvalidSetup: boolean;
  hasLoadError?: boolean;
}

export function resolveSetupBannerState({
  isConfigLoading,
  hasConfig,
  hasInvalidSetup,
  hasLoadError = false,
}: ResolveSetupBannerStateInput): SetupBannerState {
  if (isConfigLoading) {
    return {
      kind: "loading",
      variant: "info",
      message: "Checking your current setup status...",
    };
  }

  if (hasLoadError) {
    return {
      kind: "load-error",
      variant: "error",
      message: "Connection issue checking your setup. Please refresh to try again.",
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