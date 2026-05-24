import { describe, expect, it } from "vitest";
import { Quiht, render } from "../src/index.js";
import type { RenderOptions, TranslationResolver } from "../src/index.js";

/** Wraps a widget snippet in a minimal `.ui` document and renders it. */
function renderUi(widgetXml: string, options?: RenderOptions): HTMLElement {
  const ui = `<?xml version="1.0" encoding="UTF-8"?>
<ui version="4.0"><class>Form</class>${widgetXml}</ui>`;
  return render(Quiht.parse(ui), options);
}

/**
 * Fails if a now-supported widget still falls through to the dotted
 * placeholder div (border: 1px dotted #ccc + "Custom Widget:" title).
 */
function expectNoPlaceholder(el: HTMLElement): void {
  const placeholders = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))].filter(
    (n) => n.title.startsWith("Custom Widget:") || n.style.border === "1px dotted #ccc",
  );
  expect(placeholders).toHaveLength(0);
}

describe("QFrame", () => {
  it("renders a styled div honouring frameShape/frameShadow", () => {
    const el = renderUi(`
      <widget class="QFrame" name="frame">
        <property name="frameShape"><enum>QFrame::Box</enum></property>
        <property name="frameShadow"><enum>QFrame::Sunken</enum></property>
      </widget>`);
    expect(el.tagName).toBe("DIV");
    expect(el.classList.contains("QFrame")).toBe(true);
    expect(el.classList.contains("q-frame-box")).toBe(true);
    expect(el.classList.contains("q-frame-sunken")).toBe(true);
    expectNoPlaceholder(el);
  });
});

describe("QSplitter", () => {
  it("is a flex container with orientation class", () => {
    const el = renderUi(`
      <widget class="QSplitter" name="split">
        <property name="orientation"><enum>Qt::Vertical</enum></property>
      </widget>`);
    expect(el.classList.contains("QSplitter")).toBe(true);
    expect(el.classList.contains("q-vertical")).toBe(true);
    expectNoPlaceholder(el);
  });
});

describe("QSpinBox / QDoubleSpinBox", () => {
  it("renders a number input honouring min/max/value/step", () => {
    const el = renderUi(`
      <widget class="QSpinBox" name="spin">
        <property name="minimum"><number>-100</number></property>
        <property name="maximum"><number>100</number></property>
        <property name="value"><number>5</number></property>
        <property name="singleStep"><number>2</number></property>
      </widget>`);
    const input = el as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.type).toBe("number");
    expect(input.min).toBe("-100");
    expect(input.max).toBe("100");
    expect(input.value).toBe("5");
    expect(input.step).toBe("2");
    expectNoPlaceholder(el);
  });

  it("wraps prefix/suffix around the input", () => {
    const el = renderUi(`
      <widget class="QDoubleSpinBox" name="spin">
        <property name="suffix"><string>%</string></property>
        <property name="prefix"><string>$</string></property>
      </widget>`);
    expect(el.classList.contains("q-spinbox-wrap")).toBe(true);
    expect(el.querySelector(".q-spinbox-suffix")?.textContent).toBe("%");
    expect(el.querySelector(".q-spinbox-prefix")?.textContent).toBe("$");
    expect(el.querySelector("input.QDoubleSpinBox")).not.toBeNull();
    expectNoPlaceholder(el);
  });
});

describe("QSlider", () => {
  it("renders a range input honouring orientation/min/max/value", () => {
    const el = renderUi(`
      <widget class="QSlider" name="sld">
        <property name="orientation"><enum>Qt::Horizontal</enum></property>
        <property name="minimum"><number>0</number></property>
        <property name="maximum"><number>50</number></property>
        <property name="value"><number>10</number></property>
      </widget>`);
    const input = el as HTMLInputElement;
    expect(input.type).toBe("range");
    expect(input.classList.contains("q-horizontal")).toBe(true);
    expect(input.min).toBe("0");
    expect(input.max).toBe("50");
    expect(input.value).toBe("10");
    expectNoPlaceholder(el);
  });
});

describe("QProgressBar", () => {
  it("renders a progress element offsetting by minimum", () => {
    const el = renderUi(`
      <widget class="QProgressBar" name="pb">
        <property name="minimum"><number>10</number></property>
        <property name="maximum"><number>110</number></property>
        <property name="value"><number>60</number></property>
      </widget>`) as HTMLProgressElement;
    expect(el.tagName).toBe("PROGRESS");
    expect(el.max).toBe(100);
    expect(el.value).toBe(50);
    expectNoPlaceholder(el);
  });
});

describe("QDialogButtonBox", () => {
  it("renders standard buttons with human labels", () => {
    const el = renderUi(`
      <widget class="QDialogButtonBox" name="bb">
        <property name="standardButtons">
          <set>QDialogButtonBox::Cancel|QDialogButtonBox::Ok</set>
        </property>
      </widget>`);
    const buttons = el.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain("OK");
    expect(labels).toContain("Cancel");
    expectNoPlaceholder(el);
  });

  it("localizes button labels when a resolver is present", () => {
    const resolver: TranslationResolver = {
      translate: (key) => (key === "bb.Ok" ? "Okay!" : "x"),
    };
    const el = renderUi(
      `<widget class="QDialogButtonBox" name="bb">
        <property name="standardButtons"><set>QDialogButtonBox::Ok</set></property>
      </widget>`,
      { translationResolver: resolver },
    );
    const ok = el.querySelector('[data-q-standard-button="Ok"]');
    expect(ok?.textContent).toBe("Okay!");
    expect(ok?.classList.contains("quiht-translatable-node")).toBe(true);
  });
});

describe("QListWidget / QTreeWidget", () => {
  it("renders list items", () => {
    const el = renderUi(`
      <widget class="QListWidget" name="lst">
        <item><property name="text"><string>Alpha</string></property></item>
        <item><property name="text"><string>Beta</string></property></item>
      </widget>`);
    const items = el.querySelectorAll(".q-item");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe("Alpha");
    expectNoPlaceholder(el);
  });

  it("renders nested tree items", () => {
    const el = renderUi(`
      <widget class="QTreeWidget" name="tree">
        <item>
          <property name="text"><string>Parent</string></property>
          <item><property name="text"><string>Child</string></property></item>
        </item>
      </widget>`);
    const items = el.querySelectorAll(".q-item");
    expect(items.length).toBe(2);
    expect(Array.from(items).map((i) => i.textContent)).toEqual(["Parent", "Child"]);
    expectNoPlaceholder(el);
  });
});

describe("QMenuBar / QMenu", () => {
  it("renders menu titles and actions with mnemonic stripping", () => {
    const el = renderUi(`
      <widget class="QMenuBar" name="menubar">
        <widget class="QMenu" name="menuFile">
          <property name="title"><string>&amp;File</string></property>
          <addaction name="actionOpen"/>
          <addaction name="separator"/>
          <addaction name="actionQuit"/>
        </widget>
        <addaction name="menuFile"/>
      </widget>
      <action name="actionOpen"><property name="text"><string>&amp;Open</string></property></action>
      <action name="actionQuit"><property name="text"><string>&amp;Quit</string></property></action>`);

    const title = el.querySelector(".q-menu-title > span");
    expect(title?.textContent).toBe("File");

    const actions = Array.from(el.querySelectorAll(".q-menu-action > span")).map(
      (a) => a.textContent,
    );
    expect(actions).toContain("Open");
    expect(actions).toContain("Quit");
    expect(el.querySelector(".q-menu-separator")).not.toBeNull();
    expectNoPlaceholder(el);
  });
});

describe("QMainWindow", () => {
  it("scaffolds menubar + central widget + statusbar regions", () => {
    const el = renderUi(`
      <widget class="QMainWindow" name="win">
        <widget class="QMenuBar" name="menubar">
          <widget class="QMenu" name="menuFile">
            <property name="title"><string>File</string></property>
          </widget>
          <addaction name="menuFile"/>
        </widget>
        <widget class="QWidget" name="centralwidget">
          <layout class="QVBoxLayout" name="lay">
            <item>
              <widget class="QLabel" name="lbl">
                <property name="text"><string>Hi</string></property>
              </widget>
            </item>
          </layout>
        </widget>
        <widget class="QStatusBar" name="statusbar"/>
      </widget>`);
    expect(el.querySelector(".q-mainwindow-menubar")).not.toBeNull();
    expect(el.querySelector(".q-mainwindow-central")).not.toBeNull();
    expect(el.querySelector(".q-mainwindow-statusbar")).not.toBeNull();
    expect(el.querySelector(".q-mainwindow-central .QLabel")?.textContent).toBe("Hi");
    expectNoPlaceholder(el);
  });
});
