/**
 * Vanilla Web Components for FontLab complex widgets.
 *
 * The Alpine compiler (`compiler.ts`) maps custom Qt classes such as `YAngle`
 * or `QtColorPicker` to these registered custom elements. Each one exposes a
 * reflected `value` property and emits an `input` event on change, which is the
 * contract Alpine's `x-model` binds to — so a compiled `.ui` becomes reactive
 * with no framework beyond Alpine itself.
 *
 * `registerQuihtComponents()` is idempotent and safe to call in any browser-like
 * environment (including jsdom); it no-ops where `customElements` is missing.
 */

/** Base class: a custom element backed by a single native input control. */
function makeValueElement(inputType: string, baseClass: string): CustomElementConstructor {
  return class QuihtValueElement extends HTMLElement {
    private _value = "";
    private _input: HTMLInputElement | null = null;

    static get observedAttributes(): string[] {
      return ["value"];
    }

    connectedCallback(): void {
      if (this._input) return;
      this.classList.add("q-component", baseClass);
      const input = this.ownerDocument.createElement("input");
      input.type = inputType;
      input.className = `${baseClass}-control`;
      input.value = this._value;
      input.addEventListener("input", () => {
        // User interaction: adopt the control's value and re-emit so x-model and
        // any outer listeners observe the change exactly once.
        this.value = input.value;
      });
      this._input = input;
      this.appendChild(input);
    }

    attributeChangedCallback(name: string, _old: string | null, next: string | null): void {
      if (name === "value" && next !== null && next !== this._value) {
        this.value = next;
      }
    }

    get value(): string {
      return this._value;
    }

    set value(v: unknown) {
      const next = v == null ? "" : String(v);
      if (next === this._value) return;
      this._value = next;
      if (this.getAttribute("value") !== next) this.setAttribute("value", next);
      if (this._input && this._input.value !== next) this._input.value = next;
      this.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
}

/** The custom-element tag → backing input type for the FontLab widget set. */
const COMPONENTS: Record<string, string> = {
  "q-angle-popup": "number",
  "q-opacity-bar": "range",
  "q-color-picker": "color",
  "q-widget": "hidden",
};

/**
 * Registers the quiht custom elements. Idempotent: a tag already defined (by a
 * prior call or by the host page) is left untouched.
 *
 * @returns the list of tag names registered by this call (empty if all existed
 *          or the environment lacks `customElements`).
 */
export function registerQuihtComponents(): string[] {
  if (typeof customElements === "undefined" || typeof HTMLElement === "undefined") {
    return [];
  }
  const registered: string[] = [];
  for (const [tag, inputType] of Object.entries(COMPONENTS)) {
    if (customElements.get(tag)) continue;
    customElements.define(tag, makeValueElement(inputType, tag));
    registered.push(tag);
  }
  return registered;
}

/** The custom-element tag names this module defines. */
export const QUIHT_COMPONENT_TAGS = Object.keys(COMPONENTS);
