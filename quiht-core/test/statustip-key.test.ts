import { describe, expect, it } from "vitest";
import { Quiht, render } from "../src/index.js";
import type { TranslationResolver } from "../src/index.js";

/**
 * FontLab `.ts` convention: a widget whose `statusTip` is `@some.key` and whose
 * `text` is real source uses the `@`-statusTip as the canonical translation key
 * for the text — winning over the synthesized `<name>.text` key.
 */
const UI = `<?xml version="1.0" encoding="UTF-8"?>
<ui version="4.0">
 <class>Form</class>
 <widget class="QWidget" name="Form">
  <layout class="QVBoxLayout" name="lay">
   <item>
    <widget class="QLabel" name="lblWidget">
     <property name="statusTip"><string>@pref_grid.someKey</string></property>
     <property name="text"><string>Show font dimensions</string></property>
    </widget>
   </item>
   <item>
    <widget class="QLabel" name="lblPlain">
     <property name="text"><string>No status tip</string></property>
    </widget>
   </item>
  </layout>
 </widget>
</ui>`;

// translations.json-style entry keyed by the @-statusTip key.
const translations: Record<string, Record<string, string>> = {
  "pref_grid.someKey": { en: "Show font dimensions", de: "Schriftdimensionen zeigen" },
};

const resolver: TranslationResolver = {
  translate: (key, original) => translations[key]?.de ?? original,
};

describe("statusTip=@key convention", () => {
  it("prefers a @-statusTip as the translation key for the widget text", () => {
    const el = render(Quiht.parse(UI), { translationResolver: resolver });
    const widget = el.querySelector("#lblWidget");
    expect(widget?.getAttribute("data-quiht-key")).toBe("pref_grid.someKey");
    expect(widget?.textContent).toBe("Schriftdimensionen zeigen");
  });

  it("falls back to <name>.text when no @-statusTip is present", () => {
    const el = render(Quiht.parse(UI), { translationResolver: resolver });
    const plain = el.querySelector("#lblPlain");
    expect(plain?.getAttribute("data-quiht-key")).toBe("lblPlain.text");
  });
});
