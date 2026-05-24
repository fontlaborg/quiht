import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAst, parse } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const exampleUi = (name: string) => readFileSync(resolve(here, "../../example/ui", name), "utf8");

describe("buildAst", () => {
  it("builds a typed tree for a simple form", () => {
    const doc = parse(`
      <ui version="4.0">
        <class>Form</class>
        <widget class="QWidget" name="mainForm">
          <layout class="QVBoxLayout">
            <item><widget class="QLineEdit" name="usernameInput">
              <property name="placeholderText"><string>Enter name...</string></property>
            </widget></item>
            <item><widget class="QPushButton" name="submitBtn">
              <property name="text"><string>Submit</string></property>
            </widget></item>
          </layout>
        </widget>
      </ui>`);
    const ast = buildAst(doc);

    expect(ast.uiClass).toBe("Form");
    expect(ast.root.class).toBe("QWidget");
    expect(ast.root.name).toBe("mainForm");
    expect(ast.root.layout?.class).toBe("QVBoxLayout");
    expect(ast.root.layout?.items).toHaveLength(2);

    const [edit, button] = ast.root.layout!.items;
    expect(edit.widget?.class).toBe("QLineEdit");
    expect(edit.widget?.props.placeholderText).toBe("Enter name...");
    expect(button.widget?.props.text).toBe("Submit");
  });

  it("captures connections as a flat list", () => {
    const doc = parse(`
      <ui version="4.0">
        <widget class="QDialog" name="Dlg"/>
        <connections>
          <connection>
            <sender>buttonBox</sender><signal>accepted()</signal>
            <receiver>Dlg</receiver><slot>accept()</slot>
          </connection>
        </connections>
      </ui>`);
    const ast = buildAst(doc);
    expect(ast.connections).toEqual([
      { sender: "buttonBox", signal: "accepted()", receiver: "Dlg", slot: "accept()" },
    ]);
  });

  it("builds the demo-start fixture without throwing", () => {
    const ast = buildAst(parse(exampleUi("demo-start.ui")));
    expect(ast.root.class).toBeTruthy();
  });

  it("throws when the root widget is missing", () => {
    expect(() => buildAst(parse("<ui version='4.0'></ui>"))).toThrow(/Missing root/);
  });
});
