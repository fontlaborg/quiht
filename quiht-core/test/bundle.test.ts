import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { loadBundle, render } from "../src/index.js";

const MANIFEST = {
  prefix: "",
  ui: { "form.ui": "ui/form.ui" },
  resources: { ":/images/icon.png": "resources/icon.png" },
};

const UI = `<?xml version='1.0' encoding='UTF-8'?>
<ui version="4.0">
 <class>Form</class>
 <widget class="QWidget" name="Form">
  <layout class="QVBoxLayout" name="lay">
   <item>
    <widget class="QPushButton" name="btn">
     <property name="text"><string>Go</string></property>
     <property name="icon"><iconset><normaloff>:/images/icon.png</normaloff></iconset></property>
    </widget>
   </item>
  </layout>
 </widget>
</ui>`;

const TRANSLATIONS = { "btn.text": { en: "Go", de: "Los" } };

// A 1x1 transparent PNG.
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function makeZip(): Uint8Array {
  return zipSync({
    ".quiht.json": strToU8(JSON.stringify(MANIFEST)),
    "ui/form.ui": strToU8(UI),
    "resources/icon.png": PNG,
    "translations.json": strToU8(JSON.stringify(TRANSLATIONS)),
  });
}

describe("loadBundle (.quiht.zip)", () => {
  it("reads a .quiht.zip from a Uint8Array", async () => {
    const bundle = await loadBundle(makeZip());

    expect(Object.keys(bundle.uiDocs)).toContain("form.ui");
    expect(bundle.manifest.ui["form.ui"]).toBe("ui/form.ui");
    expect(bundle.translations?.["btn.text"]?.de).toBe("Los");

    // Resource resolves to a usable URL (data: in jsdom which lacks object URLs).
    const url = bundle.resourceResolver.resolveResource(":/images/icon.png");
    expect(url.startsWith("data:image/png") || url.startsWith("blob:")).toBe(true);

    bundle.dispose();
  });

  it("renders a UI from the bundle with the bundle resolver", async () => {
    const bundle = await loadBundle(makeZip());
    const doc = bundle.uiDocs["form.ui"];
    const el = render(doc, { resourceResolver: bundle.resourceResolver });

    const img = el.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).not.toBe(":/images/icon.png");
    bundle.dispose();
  });

  it("reads a .quiht.zip from an ArrayBuffer", async () => {
    const u8 = makeZip();
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    const bundle = await loadBundle(ab);
    expect(Object.keys(bundle.uiDocs)).toContain("form.ui");
    bundle.dispose();
  });

  it("wraps a raw .ui string into a bundle", async () => {
    const bundle = await loadBundle(UI);
    expect(Object.keys(bundle.uiDocs).length).toBe(1);
    bundle.dispose();
  });

  it("throws when the zip lacks a manifest", async () => {
    const zip = zipSync({ "ui/form.ui": strToU8(UI) });
    await expect(loadBundle(zip)).rejects.toThrow(/missing .quiht.json/);
  });
});
