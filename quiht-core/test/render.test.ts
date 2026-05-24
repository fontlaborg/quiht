import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Quiht, render } from "../src/index.js";
import type { RenderOptions } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const exampleUi = (name: string) =>
  readFileSync(resolve(here, "../../example/ui", name), "utf8");

describe("render", () => {
  it("renders the dlgnamesuffix dialog with expected widgets", () => {
    const doc = Quiht.parse(exampleUi("dlgnamesuffix.ui"));
    const el = render(doc);

    // Root QDialog.
    expect(el.classList.contains("QDialog")).toBe(true);
    expect(el.querySelector(".q-dialog-titlebar")).not.toBeNull();

    // Standard widgets present.
    expect(el.querySelectorAll(".QLabel").length).toBeGreaterThan(0);
    expect(el.querySelectorAll(".QPushButton").length).toBeGreaterThan(0);
    expect(el.querySelectorAll(".QToolButton").length).toBeGreaterThan(0);
    expect(el.querySelector("input.QLineEdit")).not.toBeNull();
    expect(el.querySelectorAll(".QCheckBox").length).toBeGreaterThan(0);

    // Custom widget falls back to a div carrying its class name.
    expect(el.querySelector(".YSelector")).not.toBeNull();

    // Every rendered widget carries the data-q-class tag.
    expect(el.getAttribute("data-q-class")).toBe("QDialog");
  });

  it("renders welcomeform with a scroll area", () => {
    const doc = Quiht.parse(exampleUi("welcomeform.ui"));
    const el = render(doc);
    expect(el.querySelector(".QScrollArea")).not.toBeNull();
  });

  it("uses a custom renderer when provided", () => {
    const doc = Quiht.parse(exampleUi("dlgnamesuffix.ui"));
    const options: RenderOptions = {
      customRenderers: {
        YSelector: (_node, _opts) => {
          const div = document.createElement("div");
          div.className = "YSelector custom-rendered";
          return div;
        },
      },
    };
    const el = render(doc, options);
    expect(el.querySelector(".custom-rendered")).not.toBeNull();
  });

  it("throws on a document without a root widget", () => {
    const doc = Quiht.parse("<ui version='4.0'></ui>");
    expect(() => render(doc)).toThrow(/Missing root/);
  });
});
