/// <reference types="vite/client" />

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
  gapi: {
    load: (api: string, callback: () => void) => void;
  };
}

declare namespace google.picker {
  enum ViewId {
    SPREADSHEETS = "spreadsheets",
  }

  enum Action {
    PICKED = "picked",
    CANCEL = "cancel",
  }

  interface DocumentObject {
    id: string;
    name: string;
    url: string;
    mimeType: string;
  }

  interface ResponseObject {
    action: string;
    docs?: DocumentObject[];
  }

  class DocsView {
    constructor(viewId: ViewId);
    setIncludeFolders(include: boolean): DocsView;
    setSelectFolderEnabled(enabled: boolean): DocsView;
  }

  class Picker {
    setVisible(visible: boolean): Picker;
  }

  class PickerBuilder {
    addView(view: DocsView): PickerBuilder;
    setOAuthToken(token: string): PickerBuilder;
    setDeveloperKey(key: string): PickerBuilder;
    setCallback(callback: (data: ResponseObject) => void): PickerBuilder;
    build(): Picker;
  }
}
