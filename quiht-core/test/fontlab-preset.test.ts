import { describe, expect, it } from "vitest";
import { Quiht, fontlabPreset, render } from "../src/index.js";
import type { RenderOptions } from "../src/index.js";

function renderUi(widgetXml: string, options: RenderOptions): HTMLElement {
  const ui = `<?xml version="1.0" encoding="UTF-8"?>
<ui version="4.0"><class>Form</class>${widgetXml}</ui>`;
  return render(Quiht.parse(ui), options);
}

function expectNoPlaceholder(el: HTMLElement): void {
  const placeholders = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))].filter(
    (n) => n.title.startsWith("Custom Widget:") || n.style.border === "1px dotted #ccc",
  );
  expect(placeholders).toHaveLength(0);
}

describe("fontlabPreset", () => {
  const options: RenderOptions = { customRenderers: fontlabPreset };

  it("renders YLineEditSuffix as a line edit with a suffix", () => {
    const el = renderUi(
      `<widget class="YLineEditSuffix" name="dist">
        <property name="suffix"><string>px</string></property>
      </widget>`,
      options,
    );
    expect(el.querySelector("input.QLineEdit")).not.toBeNull();
    expect(el.querySelector(".q-suffix-edit-suffix")?.textContent).toBe("px");
    expectNoPlaceholder(el);
  });

  it("renders YSelector as a labelled checkbox toggle, localizing its text", () => {
    const el = renderUi(
      `<widget class="YSelector" name="sel">
        <property name="text"><string>Show guides</string></property>
      </widget>`,
      { ...options, translationResolver: { translate: () => "Hilfslinien" } },
    );
    expect(el.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(el.querySelector("span")?.textContent).toBe("Hilfslinien");
    expect(el.querySelector(".quiht-translatable-node")).not.toBeNull();
    expectNoPlaceholder(el);
  });

  it("renders YDarkerWidget / YLighterWidget as styled divs", () => {
    const dark = renderUi(`<widget class="YDarkerWidget" name="d"/>`, options);
    expect(dark.classList.contains("q-darker-widget")).toBe(true);
    expectNoPlaceholder(dark);

    const light = renderUi(`<widget class="YLighterWidget" name="l"/>`, options);
    expect(light.classList.contains("q-lighter-widget")).toBe(true);
    expectNoPlaceholder(light);
  });

  it("covers the common Proteus Y* widgets without placeholders", () => {
    for (const cls of [
      "YCheckButton",
      "YSimpleSlider",
      "YOpacityBar",
      "YAngle",
      "QtColorPicker",
      "QtnPropertyView",
    ]) {
      const el = renderUi(`<widget class="${cls}" name="w"/>`, options);
      expectNoPlaceholder(el);
    }
  });
});
