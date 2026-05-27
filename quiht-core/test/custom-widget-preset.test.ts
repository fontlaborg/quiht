import { describe, expect, it } from "vitest";
import { Quiht, customWidgetPreset, render } from "../src/index.js";
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

describe("customWidgetPreset", () => {
  const options: RenderOptions = { customRenderers: customWidgetPreset };

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

  it("renders YSelector as a clickable text label (no checkbox), localizing its text", () => {
    const el = renderUi(
      `<widget class="YSelector" name="sel">
        <property name="text"><string>Show guides</string></property>
      </widget>`,
      { ...options, translationResolver: { translate: () => "Hilfslinien" } },
    );
    // The adjacent icon button carries the toggle — YSelector itself is a label.
    expect(el.querySelector('input[type="checkbox"]')).toBeNull();
    expect(el.tagName).toBe("SPAN");
    expect(el.textContent).toBe("Hilfslinien");
    expect(el.classList.contains("quiht-translatable-node")).toBe(true);
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

  it("covers the common Y* widgets without placeholders", () => {
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

  it("renders title/label widgets as localizable spans", () => {
    const el = renderUi(
      `<widget class="YTitleLabel" name="t"><property name="text"><string>Metrics</string></property></widget>`,
      { ...options, translationResolver: { translate: () => "Metriken" } },
    );
    expect(el.tagName.toLowerCase()).toBe("span");
    expect(el.textContent).toBe("Metriken");
    expect(el.classList.contains("q-title-label")).toBe(true);
  });

  it("renders text-edit family as textareas", () => {
    for (const cls of ["YPlainTextEdit", "YTextEdit", "CodeEditor"]) {
      const el = renderUi(`<widget class="${cls}" name="e"/>`, options);
      expect(el.tagName.toLowerCase()).toBe("textarea");
      expectNoPlaceholder(el);
    }
  });

  it("renders icon checkbox/radio with input + caption", () => {
    const cb = renderUi(
      `<widget class="YIconCheckBox" name="c"><property name="text"><string>Snap</string></property></widget>`,
      options,
    );
    expect(cb.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(cb.querySelector("span")?.textContent).toBe("Snap");

    const rb = renderUi(`<widget class="YIconRadioButton" name="r"/>`, options);
    expect(rb.querySelector('input[type="radio"]')).not.toBeNull();
  });

  it("renders selectable list/tree as item views with rows", () => {
    const el = renderUi(
      `<widget class="YSelectableList" name="lst">
         <item><property name="text"><string>Alpha</string></property></item>
         <item><property name="text"><string>Beta</string></property></item>
       </widget>`,
      options,
    );
    expect(el.tagName.toLowerCase()).toBe("ul");
    expect(el.querySelectorAll("li.q-item")).toHaveLength(2);
    expectNoPlaceholder(el);
  });

  it("renders container widgets so children flow in", () => {
    const el = renderUi(
      `<widget class="YPanelWidget" name="p">
         <layout class="QVBoxLayout">
           <item><widget class="QLabel" name="lbl"><property name="text"><string>Hi</string></property></widget></item>
         </layout>
       </widget>`,
      options,
    );
    expect(el.classList.contains("q-panel-widget")).toBe(true);
    expect(el.querySelector(".QLabel")?.textContent).toBe("Hi");
    expectNoPlaceholder(el);
  });

  it("renders the broad custom-widget set without placeholders", () => {
    for (const cls of [
      "YBaseWidget",
      "YLineEditArrowDown",
      "YColorButton",
      "YNodePreview",
      "YCenterSelector",
      "YComboBox",
      "YSidebarWidget",
      "YToolTipsWidget",
      "YColorPreview",
      "YGradientBar",
      "YHueBar",
      "YColorRing",
      "FontPreviewWidget",
      "GlyphPreviewWidget",
      "FontCellChart",
      "YRoundedLabel",
      "YTransparentLabel",
      "YRotatedLabel",
    ]) {
      const el = renderUi(`<widget class="${cls}" name="w"/>`, options);
      expectNoPlaceholder(el);
    }
  });
});
