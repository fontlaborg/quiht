# Research: Qt .ui rendering in HTML

This document researches techniques and architectures for building `quiht-core`, a client-side TypeScript/WASM library that renders Qt 5/6 `.ui` layout files to standard HTML/CSS.

---

## 1. Parser Selection: Web API vs WASM / Custom Parsers

### Native Browser DOMParser
Since `quiht-core` is targetable for client-side web application deployment, the browser's built-in `DOMParser` is the most efficient and lightweight XML parser available:
- **Zero dependency**: Extremely small footprint.
- **Fast and robust**: Standardized, handled by browser's native C++ engine.
- **Standard DOM querying**: We can use standard DOM methods (`querySelector`, `querySelectorAll`, `getAttribute`, `children`, etc.) to traverse the parsed `.ui` XML document.

*Conclusion*: Native `DOMParser` with `application/xml` mime-type is the recommended parser.

---

## 2. Layout Mapping: Qt Layouts to CSS

Qt layouts govern how widgets are placed and sized. We map these to modern CSS:

### 1. QVBoxLayout and QHBoxLayout
- **Qt Concept**: Arranges widgets in a vertical or horizontal line.
- **CSS Mapping**: Flexbox.
  - `QVBoxLayout` -> `display: flex; flex-direction: column;`
  - `QHBoxLayout` -> `display: flex; flex-direction: row;`
- **Spacing / Margins**:
  - `spacing` property maps to CSS `gap` property.
  - `leftMargin`, `topMargin`, `rightMargin`, `bottomMargin` map to CSS `padding: top right bottom left;`.

### 2. QGridLayout
- **Qt Concept**: Arranges widgets in a 2D grid.
- **CSS Mapping**: Grid Layout.
  - Layout items define `row`, `column`, `rowspan` (optional), and `colspan` (optional) attributes.
  - `QGridLayout` element -> `display: grid;`
  - Child items -> `grid-row: (row + 1) / span (rowspan); grid-column: (column + 1) / span (colspan);`. (Note: CSS grid uses 1-based indexing).

### 3. Spacers (`QSpacerItem`)
- **Qt Concept**: Invisible space-filling widget to push other widgets.
- **CSS Mapping**:
  - If inside a flex container, map to a empty `div` with `flex-grow: 1`.
  - If fixed size, map to a `div` with `width` or `height` set explicitly.

---

## 3. Widget Mapping: QWidgets to Semantic HTML

Each `<widget>` tag has a `class` attribute indicating its type.

| Qt Class | HTML Element | CSS / Styling Notes |
| :--- | :--- | :--- |
| `QWidget` / `QFrame` | `<div>` | Generic container. `QFrame` may have borders. |
| `QDialog` | `<div>` | Centered dialog container. |
| `QMainWindow` | `<div>` | Main window container. |
| `QLabel` | `<span>` or `<label>` | Inline text. |
| `QPushButton` | `<button>` | Button with mouse hover/click states. |
| `QToolButton` | `<button>` | Icon-heavy small button. |
| `QLineEdit` | `<input type="text">` | Text input line. |
| `QTextEdit` / `QPlainTextEdit` | `<textarea>` | Multiline text. |
| `QCheckBox` | `<input type="checkbox">` | Checkable option. |
| `QRadioButton` | `<input type="radio">` | Radio option. |
| `QComboBox` | `<select>` | Dropdown selection. |
| `QGroupBox` | `<fieldset>` / `<legend>` | Box outline with title. |
| `QTabWidget` | `<div>` container | Tab bar (`ul`/`li`) + card deck (`div` stack). |
| `QSplitter` | `<div>` flexbox | Splitter panels with separator resize bar. |
| `QScrollArea` | `<div>` | Container with `overflow: auto;`. |
| *Custom Class* | `<div>` | Falls back to generic container with custom class name. |

---

## 4. Qt Style Sheet (QSS) Conversion to CSS

Qt `.ui` files often contain inline CSS in QSS format via `<property name="styleSheet">`.
QSS is a subset of CSS, but uses Qt widget classes as selectors.

### Mapping QSS Selectors
Since we render widgets with classes matching their Qt names (e.g., `<button class="QPushButton">`), we can convert QSS to CSS directly:
1. Class selectors: `QPushButton` in QSS matches `.QPushButton` in CSS.
2. Property selectors: QSS `QPushButton:hover` maps to `.QPushButton:hover`.
3. Qt-specific colors (e.g. `qlineargradient` syntax):
   - A regex preprocessor can map standard Qt linear gradient syntax:
     `qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #fff, stop:1 #eee)`
     to standard CSS linear gradient:
     `linear-gradient(to bottom, #fff 0%, #eee 100%)`.

---

## 5. Resource Mapping via .quiht.json

Qt references images using resources (e.g., `:/images/resources/open.png`).
To support purely client-side rendering without compiling QRC, we map resource URIs to web-accessible URLs.

A `.quiht.json` file maps resource paths:
```json
{
  "prefix": "http://localhost:8000/assets/",
  "ui": {
    "mainwindow": "ui/mainwindow.ui"
  },
  "resources": {
    "images/resources/open.png": "resources/open.png"
  }
}
```
At runtime, the renderer replaces all `:/images/` or `qrc:/` prefixes with the matching URL resolved from the manifest.
