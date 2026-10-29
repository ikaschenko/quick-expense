import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enSrc from "../../landing/lang/en.js?raw";
import esSrc from "../../landing/lang/es.js?raw";
import ruSrc from "../../landing/lang/ru.js?raw";
import i18nSrc from "../../landing/lang/i18n.js?raw";

type Bundle = Record<string, string>;
type I18nWindow = Window & { __i18n?: Record<string, Bundle> };

const MANUAL_KEY = "qe-lang-manual";
const AUTO_KEY = "qe-lang-auto";

interface LoadOptions {
  languages?: string[];
  language?: string;
  mutateBundles?: (bundles: Record<string, Bundle>) => void;
}

function run(src: string) {
  new Function(src)();
}

function setNavigator(languages: string[] | undefined, language = "") {
  Object.defineProperty(navigator, "languages", { value: languages, configurable: true });
  Object.defineProperty(navigator, "language", { value: language, configurable: true });
}

/** Simulates a page load: fresh DOM + bundles, then the i18n runtime. */
function loadPage({ languages = ["en-US"], language = "en-US", mutateBundles }: LoadOptions = {}) {
  document.documentElement.setAttribute("lang", "en");
  document.body.innerHTML = `
    <div class="lang-switcher"></div>
    <h1 data-i18n="hero.title">Default title</h1>
    <a data-i18n="cta.support">Default support</a>
    <img data-i18n-attr="alt:hero.alt1" alt="default alt">`;
  setNavigator(languages, language);
  (window as I18nWindow).__i18n = undefined;
  run(enSrc);
  run(esSrc);
  run(ruSrc);
  mutateBundles?.((window as I18nWindow).__i18n!);
  run(i18nSrc);
}

const bundles = () => (window as I18nWindow).__i18n!;
const title = () => document.querySelector("h1")!.textContent;
const trigger = () => document.querySelector<HTMLButtonElement>(".lang-trigger")!;
const menu = () => document.querySelector<HTMLElement>(".lang-menu")!;
const option = (lang: string) => document.querySelector<HTMLElement>(`.lang-option[data-lang="${lang}"]`)!;
const pressKey = (key: string) =>
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("landing language detection", () => {
  it.each([
    [["ru-RU", "en-US"], "ru"],
    [["es-MX"], "es"],
    [["fr-FR", "de"], "en"],
    [["fr", "es", "ru"], "es"],
    [["RU"], "ru"],
    [["ru_RU"], "ru"],
    [[], "en"],
  ])("should resolve %j to %s", (languages, expected) => {
    loadPage({ languages });
    expect(document.documentElement.lang).toBe(expected);
    expect(title()).toBe(bundles()[expected]["hero.title"]);
  });

  it("should fall back to navigator.language when languages is empty", () => {
    loadPage({ languages: [], language: "ru-RU" });
    expect(document.documentElement.lang).toBe("ru");
  });

  it("should fall back to English when languages is undefined and language is empty", () => {
    loadPage({ languages: undefined, language: "" });
    expect(document.documentElement.lang).toBe("en");
  });
});

describe("landing language persistence", () => {
  it("should store the detected language as auto and not as manual", () => {
    loadPage({ languages: ["ru-RU"] });
    expect(localStorage.getItem(AUTO_KEY)).toBe("ru");
    expect(localStorage.getItem(MANUAL_KEY)).toBeNull();
  });

  it("should re-detect on every load instead of trusting the stored auto result", () => {
    loadPage({ languages: ["en-US"] });
    expect(localStorage.getItem(AUTO_KEY)).toBe("en");

    loadPage({ languages: ["ru-RU"] });
    expect(document.documentElement.lang).toBe("ru");
    expect(localStorage.getItem(AUTO_KEY)).toBe("ru");
  });

  it.each(["en", "es"])("should keep manual choice %s over browser preferences", (manual) => {
    localStorage.setItem(MANUAL_KEY, manual);
    loadPage({ languages: ["ru-RU"] });
    expect(document.documentElement.lang).toBe(manual);
  });

  it("should detect again when the saved manual value is unsupported", () => {
    localStorage.setItem(MANUAL_KEY, "de");
    loadPage({ languages: ["ru-RU"] });
    expect(document.documentElement.lang).toBe("ru");
  });

  it("should ignore the legacy qe-lang key", () => {
    localStorage.setItem("qe-lang", "es");
    loadPage({ languages: ["ru-RU"] });
    expect(document.documentElement.lang).toBe("ru");
  });

  it("should still detect and switch when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    loadPage({ languages: ["ru-RU"] });
    expect(document.documentElement.lang).toBe("ru");

    trigger().click();
    option("es").click();
    expect(document.documentElement.lang).toBe("es");
  });
});

describe("landing translations", () => {
  it("should apply text, attribute and html lang for the active language", () => {
    loadPage({ languages: ["ru"] });
    expect(title()).toBe(bundles().ru["hero.title"]);
    expect(document.querySelector("img")!.getAttribute("alt")).toBe(bundles().ru["hero.alt1"]);
  });

  it("should fall back to English when a key is missing in the active bundle", () => {
    loadPage({
      languages: ["ru"],
      mutateBundles: (b) => delete b.ru["cta.support"],
    });
    expect(document.querySelector("a")!.textContent).toBe(bundles().en["cta.support"]);
  });

  it("should leave the default text when no bundle has the key", () => {
    loadPage({
      languages: ["ru"],
      mutateBundles: (b) => {
        delete b.ru["hero.title"];
        delete b.en["hero.title"];
      },
    });
    expect(title()).toBe("Default title");
  });

  it.each(["es", "ru"])("should define every English key with non-empty text in %s", (lang) => {
    loadPage();
    const en = Object.keys(bundles().en).sort();
    expect(Object.keys(bundles()[lang]).sort()).toEqual(en);
    for (const key of en) expect(bundles()[lang][key].trim(), `${lang}:${key}`).not.toBe("");
  });
});

describe("landing language dropdown", () => {
  it("should show only the active language flag and name when closed", () => {
    loadPage({ languages: ["ru"] });
    expect(trigger().textContent).toContain("Русский");
    expect(trigger().querySelector(".lang-flag")!.textContent).toBe("\uD83C\uDDF7\uD83C\uDDFA");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(menu().hidden).toBe(true);
  });

  it("should list English, Spanish and Russian with the active one selected", () => {
    loadPage({ languages: ["es"] });
    const opts = [...document.querySelectorAll(".lang-option")];
    expect(opts.map((o) => o.querySelector(".lang-name")!.textContent)).toEqual(["English", "Español", "Русский"]);
    expect(opts.map((o) => o.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
  });

  it("should expose a localized accessible name on the trigger", () => {
    loadPage({ languages: ["ru"] });
    expect(trigger().getAttribute("aria-label")).toBe("Язык: Русский");
  });

  it("should open, focus the selected option and toggle closed on second click", () => {
    loadPage({ languages: ["es"] });
    trigger().click();
    expect(menu().hidden).toBe(false);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(option("es"));

    trigger().click();
    expect(menu().hidden).toBe(true);
  });

  it("should switch immediately, close and save a manual choice on click", () => {
    loadPage({ languages: ["en-US"] });
    trigger().click();
    option("ru").click();

    expect(document.documentElement.lang).toBe("ru");
    expect(title()).toBe(bundles().ru["hero.title"]);
    expect(trigger().textContent).toContain("Русский");
    expect(option("ru").getAttribute("aria-selected")).toBe("true");
    expect(menu().hidden).toBe(true);
    expect(localStorage.getItem(MANUAL_KEY)).toBe("ru");
  });

  it("should remember an explicit English choice over a Russian browser", () => {
    loadPage({ languages: ["ru"] });
    trigger().click();
    option("en").click();

    loadPage({ languages: ["ru"] });
    expect(document.documentElement.lang).toBe("en");
  });

  it("should close on Escape without changing the selection and restore focus", () => {
    loadPage({ languages: ["es"] });
    trigger().click();
    pressKey("ArrowDown");
    pressKey("Escape");

    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
    expect(document.documentElement.lang).toBe("es");
    expect(localStorage.getItem(MANUAL_KEY)).toBeNull();
  });

  it("should navigate with arrows, Home and End and wrap around", () => {
    loadPage({ languages: ["en"] });
    trigger().click();
    pressKey("ArrowUp");
    expect(document.activeElement).toBe(option("ru"));
    pressKey("ArrowDown");
    expect(document.activeElement).toBe(option("en"));
    pressKey("End");
    expect(document.activeElement).toBe(option("ru"));
    pressKey("Home");
    expect(document.activeElement).toBe(option("en"));
  });

  it.each(["Enter", " "])("should select the focused option with %j", (key) => {
    loadPage({ languages: ["en"] });
    trigger().click();
    pressKey("ArrowDown");
    pressKey(key);

    expect(document.documentElement.lang).toBe("es");
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
    expect(localStorage.getItem(MANUAL_KEY)).toBe("es");
  });

  it("should open from the trigger with ArrowDown", () => {
    loadPage();
    trigger().focus();
    pressKey("ArrowDown");
    expect(menu().hidden).toBe(false);
  });

  it("should close on an outside click without changing the selection", () => {
    loadPage({ languages: ["en"] });
    trigger().click();
    document.body.click();

    expect(menu().hidden).toBe(true);
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem(MANUAL_KEY)).toBeNull();
  });
});
