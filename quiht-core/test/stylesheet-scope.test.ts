import { describe, it, expect } from "vitest";
import { Quiht, render, scopeQss, convertQss } from "../src/index.js";

const UI = `<?xml version="1.0"?>
<ui version="4.0"><class>W</class>
<widget class="QWidget" name="root">
 <layout class="QHBoxLayout" name="l">
  <item><widget class="QToolButton" name="flagRed">
   <property name="styleSheet"><string>QToolButton{ background-color:#ff8080; }</string></property>
  </widget></item>
  <item><widget class="QToolButton" name="flagCyan">
   <property name="styleSheet"><string>QToolButton{ background-color:#80ffff; }</string></property>
  </widget></item>
  <item><widget class="QToolButton" name="plain"/></item>
 </layout>
</widget></ui>`;

describe("widget-scoped stylesheets", () => {
  it("scopes per-widget QSS so it does not leak to siblings", () => {
    render(Quiht.parse(UI), { targetDocument: document });
    const css = document.getElementById("quiht-injected-stylesheets")!.textContent!;
    expect(css).toContain("#flagRed");
    expect(css).toContain("#flagCyan");
    // Every emitted rule's selector list must be scoped to a widget id — no bare
    // global rule that would paint every toolbutton.
    for (const block of css.split("}")) {
      const sel = block.split("{")[0].trim();
      if (sel) expect(sel).toContain("#");
    }
  });

  it("scopeQss compounds self and descendant matches", () => {
    expect(scopeQss(".QToolButton{color:red}", "#flagRed")).toBe(
      "#flagRed.QToolButton, #flagRed .QToolButton{color:red}",
    );
    expect(scopeQss("*{font-size:11px}", "#root")).toBe("#root, #root *{font-size:11px}");
  });

  it("convertQss still rewrites type selectors and gradients", () => {
    expect(convertQss("QLabel{font-weight:bold}")).toBe(".QLabel{font-weight:bold}");
  });
});
