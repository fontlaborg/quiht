import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compile, parse } from "../src/index.js";
import type { TranslationResolver } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const exampleUi = (name: string) => readFileSync(resolve(here, "../../example/ui", name), "utf8");

const POC = `
  <ui version="4.0">
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
  </ui>`;

describe("compile (task004 POC)", () => {
  it("emits an Alpine x-data scope, x-model binding, and dispatching button", () => {
    const html = compile(parse(POC));

    // State layer: the root collects the bound input's initial value.
    expect(html).toContain(`x-data="{ usernameInput: '' }"`);
    // DOM + state: line edit maps to a native input bound with x-model.
    expect(html).toContain(`x-model="usernameInput"`);
    expect(html).toContain(`placeholder="Enter name..."`);
    // Behavior: button dispatches an Alpine event by default.
    expect(html).toContain(`@click="$dispatch('submit-btn-clicked')"`);
    expect(html).toContain(`>Submit</button>`);
    // Layout: flexbox utility class.
    expect(html).toContain(`q-vbox-layout`);
  });

  it("binds spinbox/checkbox initial values into the scope", () => {
    const html = compile(
      parse(`
      <ui version="4.0"><widget class="QWidget" name="w"><layout class="QVBoxLayout">
        <item><widget class="QSpinBox" name="size"><property name="value"><number>12</number></property></widget></item>
        <item><widget class="QCheckBox" name="bold"><property name="checked"><bool>true</bool></property><property name="text"><string>Bold</string></property></widget></item>
      </layout></widget></ui>`),
    );
    expect(html).toMatch(/x-data="\{[^"]*size: 12[^"]*\}"/);
    expect(html).toMatch(/x-data="\{[^"]*bold: true[^"]*\}"/);
    expect(html).toContain(`x-model.number="size"`);
  });
});

describe("compile — connections (behavior layer)", () => {
  it("wires a mapped signal into sender dispatch + receiver listener", () => {
    const html = compile(
      parse(`
      <ui version="4.0"><widget class="QWidget" name="form"><layout class="QVBoxLayout">
        <item><widget class="QLineEdit" name="field"/></item>
        <item><widget class="QPushButton" name="btn"><property name="text"><string>Clear</string></property></widget></item>
      </layout></widget>
      <connections><connection>
        <sender>btn</sender><signal>clicked()</signal>
        <receiver>field</receiver><slot>clear()</slot>
      </connection></connections></ui>`),
    );
    expect(html).toContain(`@click="$dispatch('btn-clicked')"`);
    expect(html).toContain(`@btn-clicked.window="field = ''"`);
  });

  it("records unmapped signals (accepted/rejected) as honest comments", () => {
    const html = compile(parse(exampleUi("demo-dialog.ui")));
    // demo-dialog has no connections; assert the buttonbox accept/reject path
    // via an inline dialog fixture instead.
    const dlg = compile(
      parse(`
      <ui version="4.0"><widget class="QDialog" name="Dlg"/>
      <connections><connection>
        <sender>buttonBox</sender><signal>accepted()</signal>
        <receiver>Dlg</receiver><slot>accept()</slot>
      </connection></connections></ui>`),
    );
    expect(html).toBeTruthy();
    expect(dlg).toContain("unmapped signal buttonBox.accepted()");
  });
});

describe("compile — custom widgets", () => {
  it("maps known custom classes to registered custom elements", () => {
    const html = compile(
      parse(
        `<ui version="4.0"><widget class="YAngle" name="angle"/></ui>`,
      ),
    );
    expect(html).toContain(`<q-angle-popup`);
    expect(html).toContain(`x-model="angle"`);
  });

  it("falls back to <q-widget> for unknown classes", () => {
    const html = compile(parse(`<ui version="4.0"><widget class="FooBar" name="x"/></ui>`));
    expect(html).toContain(`<q-widget`);
    expect(html).toContain(`data-q-class="FooBar"`);
  });

  it("throws on unknown classes in strict mode", () => {
    expect(() =>
      compile(parse(`<ui version="4.0"><widget class="FooBar" name="x"/></ui>`), {
        strict: true,
        customElements: {},
      }),
    ).toThrow(/unknown widget class/);
  });
});

describe("compile — localization", () => {
  it("honours @key translation and tags translatable nodes", () => {
    const resolver: TranslationResolver = {
      translate: (key) => (key === "ui.submit" ? "Senden" : `[${key}]`),
    };
    const html = compile(
      parse(
        `<ui version="4.0"><widget class="QPushButton" name="b">
           <property name="text"><string>@ui.submit</string></property>
         </widget></ui>`,
      ),
      { translationResolver: resolver },
    );
    expect(html).toContain(`>Senden</button>`);
    expect(html).toContain(`data-quiht-key="ui.submit"`);
  });
});
