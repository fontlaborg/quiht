import { describe, it, expect } from "vitest";
import { parse } from "quiht-core";
import { extractTranslatableItems, escapeHtml } from "../src/main.js";

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

describe("extractTranslatableItems", () => {
  const doc = parse(UI);
  const items = extractTranslatableItems(doc);

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
