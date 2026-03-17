/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_REDIRECT_URI?: string;
  readonly VITE_EXCHANGE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: "" | "consent" | "none" }) => void;
}

interface GoogleOAuth2Namespace {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
      scope?: string;
    }) => void;
    error_callback?: (error: { type: string; message?: string }) => void;
    include_granted_scopes?: boolean;
    login_hint?: string;
  }) => GoogleTokenClient;
}

interface GoogleIdNamespace {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: string;
      shape?: "rectangular" | "pill" | "circle" | "square";
      width?: number;
    },
  ) => void;
}

interface Window {
  google?: {
    accounts?: {
      id?: GoogleIdNamespace;
      oauth2?: GoogleOAuth2Namespace;
    };
  };
}
