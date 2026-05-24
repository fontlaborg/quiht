import { describe, expect, it } from "vitest";
import { Quiht, render } from "../src/index.js";
import type { TranslationResolver } from "../src/index.js";

const UI = `<?xml version='1.0' encoding='UTF-8'?>
<ui version="4.0">
 <class>Form</class>
 <widget class="QWidget" name="Form">
  <layout class="QVBoxLayout" name="lay">
   <item>
    <widget class="QLabel" name="lblKey">
     <property name="text"><string>@dlg.label</string></property>
    </widget>
   </item>
   <item>
    <widget class="QLabel" name="lblPlain">
     <property name="text"><string>Plain Text</string></property>
    </widget>
   </item>
  </layout>
 </widget>
</ui>`;

describe("localization tagging", () => {
  it("tags @-prefixed strings with the explicit key", () => {
    const el = render(Quiht.parse(UI));
    const keyed = el.querySelector('[data-quiht-key="dlg.label"]');
    expect(keyed).not.toBeNull();
    expect(keyed?.classList.contains("quiht-translatable-node")).toBe(true);
    expect(keyed?.getAttribute("data-quiht-original")).toBe("@dlg.label");
  });

  it("does not tag plain strings without a resolver", () => {
    const el = render(Quiht.parse(UI));
    const plain = el.querySelector("#lblPlain");
    expect(plain?.classList.contains("quiht-translatable-node")).toBe(false);
  });

  it("tags and translates all strings when a resolver is present", () => {
    const resolver: TranslationResolver = {
      translate: (key, original) => (key === "dlg.label" ? "Etikett" : `T:${original}`),
    };
    const el = render(Quiht.parse(UI), { translationResolver: resolver });

    const keyed = el.querySelector("#lblKey");
    expect(keyed?.textContent).toBe("Etikett");
    expect(keyed?.getAttribute("data-quiht-key")).toBe("dlg.label");

    const plain = el.querySelector("#lblPlain");
    expect(plain?.classList.contains("quiht-translatable-node")).toBe(true);
    expect(plain?.getAttribute("data-quiht-key")).toBe("lblPlain.text");
    expect(plain?.textContent).toBe("T:Plain Text");
  });
});
