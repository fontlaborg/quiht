import { describe, expect, it } from "vitest";
import { registerQuihtComponents, QUIHT_COMPONENT_TAGS } from "../src/index.js";

describe("registerQuihtComponents", () => {
  it("registers the custom elements idempotently", () => {
    const first = registerQuihtComponents();
    expect(first).toEqual(QUIHT_COMPONENT_TAGS);
    for (const tag of QUIHT_COMPONENT_TAGS) {
      expect(customElements.get(tag)).toBeTypeOf("function");
    }
    // Second call is a no-op (already defined).
    expect(registerQuihtComponents()).toEqual([]);
  });

  it("reflects value and dispatches input — the x-model contract", () => {
    registerQuihtComponents();
    const el = document.createElement("q-angle-popup") as HTMLElement & { value: string };
    document.body.appendChild(el);

    let events = 0;
    el.addEventListener("input", () => events++);

    el.value = "45";
    expect(el.value).toBe("45");
    expect(el.getAttribute("value")).toBe("45");
    expect(events).toBe(1);

    // Setting the same value again does not re-dispatch.
    el.value = "45";
    expect(events).toBe(1);

    el.remove();
  });

  it("adopts the value when the reflected attribute changes", () => {
    registerQuihtComponents();
    const el = document.createElement("q-color-picker") as HTMLElement & { value: string };
    document.body.appendChild(el);
    el.setAttribute("value", "#ff0000");
    expect(el.value).toBe("#ff0000");
    el.remove();
  });
});
