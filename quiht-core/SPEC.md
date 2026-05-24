# Technical Spec: quiht-core

`quiht-core` is a client-side TypeScript library that parses Qt `.ui` XML files and renders them as standard HTML/CSS.

---

## 1. API Architecture

### Public Types and Interfaces

```typescript
export interface ResourceResolver {
  /** Resolves a QRC path (e.g. ':/images/resources/open.png') to a web-accessible URL */
  resolveResource(qrcPath: string): string;
}

export interface TranslationResolver {
  /** Resolves a key (e.g., '@demo.dialog.labelAsset') or original text to localized string */
  translate(key: string, originalText: string): string;
}

export interface RenderOptions {
  /** Optional resolver for image/icon resources */
  resourceResolver?: ResourceResolver;
  /** Optional resolver for translations */
  translationResolver?: TranslationResolver;
  /** Custom widget renderers override map */
  customRenderers?: Record<string, (element: Element, options: RenderOptions) => HTMLElement>;
}

export interface QuihtManifest {
  prefix: string;
  ui: Record<string, string>;
  resources: Record<string, string>;
}
```

### Main Class API

```typescript
export class Quiht {
  /** Parses a Qt .ui XML string into a browser Document */
  static parse(xmlText: string): Document;

  /** Renders a parsed Qt .ui Document into an HTML DOM element */
  static render(doc: Document, options?: RenderOptions): HTMLElement;
}
```

---

## 2. Rendering Rules & Component Mappings

### 2.1 CSS Styling Layer (`index.css`)
We will create a default stylesheet `index.css` that provides the visual skin of Qt Widgets (Fusion style). It contains:
- CSS variables for uniform colors:
  ```css
  :root {
    --q-window-bg: #f0f0f0;
    --q-widget-bg: #ffffff;
    --q-text-color: #333333;
    --q-border-color: #bcbcbc;
    --q-primary-color: #0078d4;
    --q-primary-text: #ffffff;
    --q-hover-bg: #e5f1fb;
    --q-disabled-bg: #e6e6e6;
    --q-disabled-text: #8c8c8c;
  }
  ```
- Classes mapping 1-to-1 with Qt classes:
  - `.QWidget`: inherits background and text colors.
  - `.QDialog`: modal or window outline styling, rounded titlebar mock.
  - `.QPushButton`: border, border-radius, linear gradient background, hover/active/focus visual indicators.
  - `.QLineEdit`, `.QTextEdit`: padding, border, focus outline shadow.
  - `.QGroupBox`: border-top border-left outline, legend spacing.
  - `.QTabWidget`: tab pane layout.

### 2.2 Layout Processor
The parser maps layout elements:
- **Margins**: Margins are read from properties (`leftMargin`, `rightMargin`, `topMargin`, `bottomMargin`). They are compiled into CSS padding: `padding: top right bottom left;`.
- **Spacing**: The `spacing` property maps to CSS `gap`.
- **Alignments**: Vertical/horizontal alignments (`Qt::AlignLeft`, `Qt::AlignTop`, etc.) map to flex align-self or align-items properties.

---

## 3. Localization Pipeline

Qt `.ui` elements have localizable properties (like `<string>`).
1. Properties are extracted from elements (e.g. `<property name="text"><string>Name</string></property>`).
2. If the string starts with `@` (e.g., `@demo.dialog.labelAsset`), it indicates a localization key.
3. If a `TranslationResolver` is provided, it calls `translate(key, defaultValue)`.
4. If no resolver is provided, or the translation is missing, it displays the key or default value.
5. In addition to keys starting with `@`, all plain strings are also sent to the resolver to allow translation of hardcoded strings.

---

## 4. Custom Widgets Support

To handle custom controls (e.g. `YPopupAngle`, `YSelector`):
- The renderer generates a standard `div` element.
- It assigns classes: `class="YPopupAngle QWidget"`.
- It reads custom property declarations if any.
- A registration API allows registering custom rendering hooks to draw canvas or dials for custom widgets.

---

## 5. Alpine.js compiler (string output)

Beyond the DOM `render()` (live nodes for the review viewer), `compile()` is a
parallel, SSR-friendly path that turns a `.ui` into an HTML **string** with
Alpine.js attributes + Web Components, for build-free embedding in HTML-first
apps.

1. **AST** — `buildAst(doc)` produces a typed `UiRoot` (`WidgetNode`,
   `LayoutNode`, `Connection`) separating XML traversal from element mapping.
2. **DOM layer** — Qt classes map to native tags (`QPushButton`→`<button>`,
   `QLineEdit`→`<input>`, `QProgressBar`→`<progress>`, …) or registered custom
   elements (`YAngle`→`<q-angle-popup>`); unknown widgets → `<q-widget>` or, with
   `{ strict: true }`, a compile error.
3. **State layer** — each input's initial value is collected into one root
   `x-data="{ … }"` scope; inputs bind with `x-model` (`.number` for spin/slider).
4. **Behaviour layer** — `<connections>` compile to Alpine events
   (`@click="$dispatch('…')"` on senders, `@evt.window="…"` on receivers); signals
   without a DOM equivalent are emitted as inspectable HTML comments.
5. **CSS layer** — layouts emit `q-vbox/hbox/grid-layout` utilities defined in
   `alpine.css`, themeable via `--q-*` custom properties.
6. **Web Components** — `registerQuihtComponents()` defines vanilla elements with
   a reflected `value` + `input` event (the `x-model` contract). The same `@key`
   / `<name>.text` localization contract as `render()` applies.
