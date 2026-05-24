# Technical Spec: quiht-l10n-vu Reviewer App

`quiht-l10n-vu` is a web application for localizing and validating Qt UI layouts. It allows translators and reviewers to view source and target strings in the actual visual context of the rendered interface.

---

## 1. Application Layout & User Interface

The application is structured as a single-page app (SPA) with a responsive three-pane layout:

```
+----------------------------------------------------------------------------------+
|  [Header] Quiht Localization Reviewer                        Language: [ EN v ]  |
+---------------------+-------------------------------------+----------------------+
|  Sidebar (.ui list) |  Center Pane (Visual Render)        |  Right Pane (Grid)   |
|                     |                                     |                      |
|  - demo-dialog.ui   |  +-------------------------------+  |  Key      | Source   |
|  - demo-start.ui    |  |  Dialog Title                 |  |  ---------+----------|
|  - demo-slider.ui   |  |                               |  |  label    | Asset    |
|                     |  |  [Asset] [Input           ]   |  |  selector | Tag      |
|                     |  |                               |  |                      |
|                     |  |  [ Cancel ] [ OK ]            |  |                      |
|                     |  +-------------------------------+  |                      |
|                     |                                     |                      |
+---------------------+-------------------------------------+----------------------+
```

### 1.1 Left Sidebar: UI Manifest List
- Lists all `.ui` files loaded from `.quiht.json`.
- Displays status badges for each file (e.g., number of keys, number of translated strings).

### 1.2 Center Canvas: Live UI Render
- Contains a container where `quiht-core` renders the selected `.ui` file.
- Provides zooming and panning controls to inspect complex layouts.
- Adds an overlay highlight on hover for any widget that is connected to a localizable key.

### 1.3 Right Sidebar: Translation Grid
- A table listing all translatable items in the selected `.ui` file.
- Columns:
  - **Type**: Indicator (e.g., Text, ToolTip, StatusTip, Title).
  - **Key / Path**: The Qt property name or ID (e.g. `@demo.dialog.labelAsset`).
  - **English (Source)**: The default English text.
  - **Target Translation**: The translated value in the selected language.

---

## 2. Dynamic Interactions

### 2.1 Bi-Directional Hover Highlighting
To bridge the gap between code and layout:
- **Table to Canvas**: Hovering over a row in the Translation Grid adds a `.quiht-highlight-active` CSS class to the corresponding element in the Center Canvas, causing it to pulse or display a semi-transparent outline.
- **Canvas to Table**: Clicking or hovering over a widget in the Center Canvas highlights the corresponding row in the Translation Grid and automatically scrolls it into view.

### 2.2 Language Selector
- A global dropdown menu allows switching between languages (EN, DE, FR, JA).
- Switching the language re-renders the `.ui` file using `quiht-core` and updates all text values dynamically.

---

## 3. Data Integration

The app consumes two datasets:
1. **Resource Map (`.quiht.json`)**: Configures the relative paths and prefix URLs.
2. **Localization Catalog (`translations.json`)**: An object containing keys and translations (matching the schema of `vocabularyTranslations` in `fl10n/vocabulary_app/translations.js`).
   Example:
   ```json
   {
     "demo.dialog.labelAsset": {
       "en": "Asset",
       "de": "Asset",
       "fr": "Asset",
       "ja": "アセット"
     }
   }
   ```
