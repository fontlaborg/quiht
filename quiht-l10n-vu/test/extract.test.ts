import { describe, it, expect } from "vitest";
import { parse } from "quiht-core";
import type { TranslationTable } from "quiht-core";
import { coverageFor, extractTranslatableItems, escapeHtml } from "../src/main.js";

const UI = `<?xml version="1.0" encoding="UTF-8"?>
<ui version="4.0">
 <class>Dialog</class>
 <widget class="QDialog" name="Dialog">
  <property name="windowTitle"><string>@dlg.title</string></property>
  <widget class="QLabel" name="nameLabel">
   <property name="text"><string>Name</string></property>
  </widget>
  <widget class="QComboBox" name="picker">
   <item><property name="text"><string>One</string></property></item>
   <item><property name="text"><string>Two</string></property></item>
  </widget>
 </widget>
</ui>`;

const doc = parse(UI);
const items = extractTranslatableItems(doc);

describe("extractTranslatableItems", () => {

  it("uses the @key convention when present", () => {
    expect(items.find((i) => i.key === "dlg.title")).toBeTruthy();
  });

  it("synthesises <widget>.<prop> keys for bare strings", () => {
    const label = items.find((i) => i.key === "nameLabel.text");
    expect(label?.originalText).toBe("Name");
    expect(label?.widgetClass).toBe("QLabel");
  });

  it("extracts combobox item strings", () => {
    expect(items.find((i) => i.key === "picker.item[0]")?.originalText).toBe("One");
    expect(items.find((i) => i.key === "picker.item[1]")?.originalText).toBe("Two");
  });
});

describe("escapeHtml", () => {
  it("escapes markup", () => {
    expect(escapeHtml('<a>&"')).toBe("&lt;a&gt;&amp;&quot;");
  });
});

describe("coverageFor", () => {
  const table: TranslationTable = {
    "dlg.title": { en: "Title", de: "Titel" },
    "nameLabel.text": { en: "Name" }, // no de
  };

  it("counts translated keys for the target language", () => {
    // doc has 3 keys: dlg.title, nameLabel.text, picker.item[0], picker.item[1]
    const cov = coverageFor(doc, table, "de");
    expect(cov.total).toBe(items.length);
    expect(cov.translated).toBe(1); // only dlg.title has a de entry
  });

  it("treats the source language en as fully covered", () => {
    const cov = coverageFor(doc, table, "en");
    expect(cov.translated).toBe(cov.total);
  });
});
