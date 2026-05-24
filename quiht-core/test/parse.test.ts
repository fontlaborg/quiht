import { describe, expect, it } from "vitest";
import { Quiht, parse } from "../src/index.js";

const VALID = `<?xml version='1.0' encoding='UTF-8'?>
<ui version="4.0">
 <class>Form</class>
 <widget class="QWidget" name="Form"/>
</ui>`;

describe("parse", () => {
  it("parses a valid .ui document", () => {
    const doc = parse(VALID);
    expect(doc.querySelector("ui > widget")?.getAttribute("name")).toBe("Form");
  });

  it("Quiht.parse mirrors parse", () => {
    const doc = Quiht.parse(VALID);
    expect(doc.querySelector("ui > widget")).not.toBeNull();
  });

  it("throws on malformed XML", () => {
    expect(() => parse("<ui><widget></ui>")).toThrow(/XML Parsing Error/);
  });
});
