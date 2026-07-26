let pickerReady = false;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load Google Picker script.`));
    document.head.appendChild(script);
  });
}

async function ensurePickerLoaded(): Promise<void> {
  if (pickerReady) return;
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve) => {
    window.gapi.load("picker", () => {
      pickerReady = true;
      resolve();
    });
  });
}

export interface PickerResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  name: string;
}

export async function openSpreadsheetPicker(accessToken: string, apiKey: string, appId: string): Promise<PickerResult | null> {
  await ensurePickerLoaded();

  return new Promise((resolve) => {
    const myDriveView = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(google.picker.DocsViewMode.LIST)
      .setParent("root");

    const sharedDriveView = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(google.picker.DocsViewMode.LIST)
      .setEnableDrives(true);

    new google.picker.PickerBuilder()
      .addView(myDriveView)
      .addView(sharedDriveView)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setOrigin(window.location.origin)
      .setCallback((data: google.picker.ResponseObject) => {
        if (data.action === google.picker.Action.PICKED && data.docs?.length) {
          const doc = data.docs[0];
          resolve({
            spreadsheetId: doc.id,
            spreadsheetUrl: doc.url,
            name: doc.name,
          });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build()
      .setVisible(true);
  });
}
