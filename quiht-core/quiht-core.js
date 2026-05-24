/* quiht-core.js - Client-side Qt .ui Renderer Engine */

export class Quiht {
  /**
   * Parses a Qt .ui XML string into a Document.
   * @param {string} xmlText
   * @returns {Document}
   */
  static parse(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      throw new Error("XML Parsing Error: " + parserError.textContent);
    }
    return doc;
  }

  /**
   * Renders a parsed Qt .ui Document into an HTML DOM element.
   * @param {Document} doc
   * @param {object} options
   * @returns {HTMLElement}
   */
  static render(doc, options = {}) {
    const rootWidgetNode = doc.querySelector("ui > widget");
    if (!rootWidgetNode) {
      throw new Error("Invalid .ui file: Missing root <widget> under <ui>");
    }

    // Collect all stylesheets declared in the .ui file and inject them
    const styles = [];
    const styleSheets = doc.querySelectorAll('property[name="styleSheet"] > string');
    styleSheets.forEach(sheet => {
      styles.push(sheet.textContent);
    });
    
    if (styles.length > 0) {
      this._injectStyleSheets(styles);
    }

    return this._renderWidget(rootWidgetNode, options, true);
  }

  /**
   * Injects converted stylesheets into the document head
   * @param {string[]} sheets
   */
  static _injectStyleSheets(sheets) {
    const styleId = "quiht-injected-stylesheets";
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    const cssText = sheets.map(sheet => {
      // Basic conversion of Qt QSS class selectors to standard CSS classes
      // E.g., QLabel -> .QLabel, QPushButton -> .QPushButton
      let converted = sheet.replace(/(^|[{};\s,])(QLabel|QPushButton|QLineEdit|QTextEdit|QPlainTextEdit|QComboBox|QCheckBox|QRadioButton|QGroupBox|QWidget|QFrame|QDialog)/g, '$1.$2');
      
      // Basic conversion of qlineargradient
      // E.g., qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #fff, stop:1 #eee)
      converted = converted.replace(/qlineargradient\(([^)]+)\)/g, (match, content) => {
        const parts = content.split(',').map(s => s.trim());
        const stops = parts.filter(p => p.startsWith('stop:'));
        const cssStops = stops.map(stop => {
          // stop:0.5 #ffffff -> #ffffff 50%
          const matchStop = stop.match(/stop:([0-9.]+)\s+(#[0-9a-fA-F]+|[a-zA-Z]+)/);
          if (matchStop) {
            const percent = parseFloat(matchStop[1]) * 100;
            return `${matchStop[2]} ${percent}%`;
          }
          return '';
        }).filter(s => s !== '');
        
        return `linear-gradient(to bottom, ${cssStops.join(', ')})`;
      });

      return converted;
    }).join('\n');

    styleTag.textContent = cssText;
  }

  /**
   * Helper to get a property value from a widget Node
   * @param {Element} node
   * @param {string} name
   * @returns {any}
   */
  static _getProperty(node, name) {
    const propNode = node.querySelector(`:scope > property[name="${name}"]`);
    if (!propNode) return null;

    const stringNode = propNode.querySelector("string");
    if (stringNode) return stringNode.textContent;

    const numberNode = propNode.querySelector("number");
    if (numberNode) return parseFloat(numberNode.textContent);

    const boolNode = propNode.querySelector("bool");
    if (boolNode) return boolNode.textContent === "true";

    const rectNode = propNode.querySelector("rect");
    if (rectNode) {
      return {
        x: parseInt(rectNode.querySelector("x")?.textContent || "0"),
        y: parseInt(rectNode.querySelector("y")?.textContent || "0"),
        width: parseInt(rectNode.querySelector("width")?.textContent || "0"),
        height: parseInt(rectNode.querySelector("height")?.textContent || "0")
      };
    }

    const sizeNode = propNode.querySelector("size");
    if (sizeNode) {
      return {
        width: parseInt(sizeNode.querySelector("width")?.textContent || "0"),
        height: parseInt(sizeNode.querySelector("height")?.textContent || "0")
      };
    }

    const iconNode = propNode.querySelector("iconset");
    if (iconNode) {
      return iconNode.querySelector("normaloff")?.textContent || iconNode.textContent;
    }

    return null;
  }

  /**
   * Translates a string using resolver if available
   */
  static _translate(text, key, options) {
    if (!text) return text;
    
    // Check if the text matches a key or starts with @
    let lookupKey = key;
    if (text.startsWith("@")) {
      lookupKey = text.substring(1);
    }
    
    if (options.translationResolver) {
      return options.translationResolver.translate(lookupKey, text);
    }
    
    return text;
  }

  /**
   * Renders a single widget
   * @param {Element} widgetNode
   * @param {object} options
   * @param {boolean} isRoot
   * @returns {HTMLElement}
   */
  static _renderWidget(widgetNode, options, isRoot = false) {
    const className = widgetNode.getAttribute("class") || "QWidget";
    const widgetName = widgetNode.getAttribute("name") || "";

    let el;
    let contentContainer = null;

    // Create the appropriate HTML element based on Qt class
    switch (className) {
      case "QDialog":
        el = document.createElement("div");
        el.className = "QDialog QWidget";
        
        // Add window titlebar mock
        const titlebar = document.createElement("div");
        titlebar.className = "q-dialog-titlebar";
        
        const titleText = this._getProperty(widgetNode, "windowTitle") || "Dialog";
        const translatedTitle = this._translate(titleText, `${widgetName}.windowTitle`, options);
        
        const titleSpan = document.createElement("span");
        titleSpan.textContent = translatedTitle;
        if (titleText.startsWith("@") || options.translationResolver) {
          titleSpan.className = "quiht-translatable-node";
          titleSpan.setAttribute("data-quiht-key", titleText.startsWith("@") ? titleText.substring(1) : `${widgetName}.windowTitle`);
          titleSpan.setAttribute("data-quiht-original", titleText);
        }
        titlebar.appendChild(titleSpan);

        const closeBtn = document.createElement("button");
        closeBtn.className = "QPushButton";
        closeBtn.style.width = "16px";
        closeBtn.style.height = "16px";
        closeBtn.style.padding = "0";
        closeBtn.style.minWidth = "0";
        closeBtn.textContent = "×";
        titlebar.appendChild(closeBtn);

        el.appendChild(titlebar);

        contentContainer = document.createElement("div");
        contentContainer.className = "q-dialog-content";
        el.appendChild(contentContainer);
        break;

      case "QLabel":
        el = document.createElement("span");
        el.className = "QLabel QWidget";
        
        const labelText = this._getProperty(widgetNode, "text") || "";
        const translatedLabel = this._translate(labelText, `${widgetName}.text`, options);
        el.textContent = translatedLabel;

        const wordWrap = this._getProperty(widgetNode, "wordWrap");
        if (wordWrap) {
          el.classList.add("q-word-wrap");
        }

        // Tag for localization highlight
        if (labelText.startsWith("@") || options.translationResolver) {
          el.classList.add("quiht-translatable-node");
          el.setAttribute("data-quiht-key", labelText.startsWith("@") ? labelText.substring(1) : `${widgetName}.text`);
          el.setAttribute("data-quiht-original", labelText);
        }
        break;

      case "QPushButton":
      case "QToolButton":
        el = document.createElement("button");
        el.className = `${className} QWidget`;
        
        const btnText = this._getProperty(widgetNode, "text") || "";
        const translatedBtn = this._translate(btnText, `${widgetName}.text`, options);
        el.textContent = translatedBtn;

        // Load Icon
        const iconPath = this._getProperty(widgetNode, "icon");
        if (iconPath) {
          let resolvedUrl = iconPath;
          if (options.resourceResolver) {
            resolvedUrl = options.resourceResolver.resolveResource(iconPath);
          }
          const img = document.createElement("img");
          img.src = resolvedUrl;
          img.style.height = "16px";
          img.style.width = "16px";
          el.prepend(img);
        }

        if (btnText.startsWith("@") || options.translationResolver) {
          el.classList.add("quiht-translatable-node");
          el.setAttribute("data-quiht-key", btnText.startsWith("@") ? btnText.substring(1) : `${widgetName}.text`);
          el.setAttribute("data-quiht-original", btnText);
        }
        break;

      case "QLineEdit":
        el = document.createElement("input");
        el.type = "text";
        el.className = "QLineEdit QWidget";
        const placeholder = this._getProperty(widgetNode, "placeholderText");
        if (placeholder) {
          el.placeholder = this._translate(placeholder, `${widgetName}.placeholderText`, options);
        }
        break;

      case "QTextEdit":
      case "QPlainTextEdit":
        el = document.createElement("textarea");
        el.className = `${className} QWidget`;
        break;

      case "QCheckBox":
        el = document.createElement("label");
        el.className = "QCheckBox QWidget";
        
        const cbInput = document.createElement("input");
        cbInput.type = "checkbox";
        el.appendChild(cbInput);
        
        const cbText = this._getProperty(widgetNode, "text") || "";
        const translatedCb = this._translate(cbText, `${widgetName}.text`, options);
        const cbSpan = document.createElement("span");
        cbSpan.textContent = translatedCb;
        el.appendChild(cbSpan);

        if (cbText.startsWith("@") || options.translationResolver) {
          cbSpan.className = "quiht-translatable-node";
          cbSpan.setAttribute("data-quiht-key", cbText.startsWith("@") ? cbText.substring(1) : `${widgetName}.text`);
          cbSpan.setAttribute("data-quiht-original", cbText);
        }
        break;

      case "QRadioButton":
        el = document.createElement("label");
        el.className = "QRadioButton QWidget";
        
        const rbInput = document.createElement("input");
        rbInput.type = "radio";
        // Give same name to siblings if needed, group under parent
        rbInput.name = widgetNode.parentNode?.getAttribute("name") || "radio-group";
        el.appendChild(rbInput);
        
        const rbText = this._getProperty(widgetNode, "text") || "";
        const translatedRb = this._translate(rbText, `${widgetName}.text`, options);
        const rbSpan = document.createElement("span");
        rbSpan.textContent = translatedRb;
        el.appendChild(rbSpan);

        if (rbText.startsWith("@") || options.translationResolver) {
          rbSpan.className = "quiht-translatable-node";
          rbSpan.setAttribute("data-quiht-key", rbText.startsWith("@") ? rbText.substring(1) : `${widgetName}.text`);
          rbSpan.setAttribute("data-quiht-original", rbText);
        }
        break;

      case "QComboBox":
        const container = document.createElement("div");
        container.className = "QComboBox-container QWidget";
        
        el = document.createElement("select");
        el.className = "QComboBox QWidget";
        container.appendChild(el);
        
        // Add items if any in UI
        const itemNodes = widgetNode.querySelectorAll(":scope > item");
        itemNodes.forEach(item => {
          const itemTextNode = item.querySelector("property[name=\"text\"] > string");
          if (itemTextNode) {
            const rawText = itemTextNode.textContent;
            const opt = document.createElement("option");
            opt.textContent = this._translate(rawText, "", options);
            el.appendChild(opt);
          }
        });
        
        // Set element reference to the container for appending to layout, 
        // but set el to select so attributes are applied.
        el = container;
        break;

      case "QGroupBox":
        el = document.createElement("div");
        el.className = "QGroupBox QWidget";
        
        const groupTitleText = this._getProperty(widgetNode, "title") || "";
        const translatedGroupTitle = this._translate(groupTitleText, `${widgetName}.title`, options);
        
        const legend = document.createElement("legend");
        legend.textContent = translatedGroupTitle;
        el.appendChild(legend);

        if (groupTitleText.startsWith("@") || options.translationResolver) {
          legend.className = "quiht-translatable-node";
          legend.setAttribute("data-quiht-key", groupTitleText.startsWith("@") ? groupTitleText.substring(1) : `${widgetName}.title`);
          legend.setAttribute("data-quiht-original", groupTitleText);
        }
        break;

      case "QTabWidget":
        el = document.createElement("div");
        el.className = "QTabWidget QWidget";
        
        // Tab widget requires tab bar + card deck
        const tabBar = document.createElement("ul");
        tabBar.className = "q-tab-bar";
        el.appendChild(tabBar);

        const tabStack = document.createElement("div");
        tabStack.className = "q-tab-stack";
        el.appendChild(tabStack);

        contentContainer = tabStack;
        
        // Tab widget pages are parsed later in layout or children. We'll set up tab switching
        el.addEventListener("click", (e) => {
          const btn = e.target.closest(".q-tab-button");
          if (!btn) return;
          const index = parseInt(btn.getAttribute("data-index") || "0");
          
          tabBar.querySelectorAll(".q-tab-button").forEach((b, i) => {
            b.classList.toggle("active", i === index);
          });
          tabStack.querySelectorAll(".q-tab-page").forEach((p, i) => {
            p.classList.toggle("active", i === index);
          });
        });
        break;

      case "QScrollArea":
        el = document.createElement("div");
        el.className = "QScrollArea QWidget";
        contentContainer = document.createElement("div");
        contentContainer.className = "QWidget";
        el.appendChild(contentContainer);
        break;

      default:
        // Unknown widget, check custom renderers
        if (options.customRenderers && options.customRenderers[className]) {
          el = options.customRenderers[className](widgetNode, options);
        } else {
          // Fallback container representation
          el = document.createElement("div");
          el.className = `${className} QWidget`;
          el.style.border = "1px dotted #ccc";
          el.style.minHeight = "24px";
          el.title = `Custom Widget: ${className}`;
          
          // Show widget type name inside it as placeholder if it has no child layouts
          if (!widgetNode.querySelector("layout")) {
            const span = document.createElement("span");
            span.style.fontSize = "9px";
            span.style.color = "#999";
            span.style.padding = "4px";
            span.textContent = className;
            el.appendChild(span);
          }
        }
        break;
    }

    // Set name and type tags
    el.setAttribute("data-q-class", className);
    el.setAttribute("data-q-name", widgetName);
    el.id = widgetName;

    // Apply geometry if specified and if it's the root widget or not inside a layout
    const geometry = this._getProperty(widgetNode, "geometry");
    if (geometry && (isRoot || !widgetNode.parentNode || widgetNode.parentNode.tagName !== "item")) {
      el.style.position = "absolute";
      el.style.left = `${geometry.x}px`;
      el.style.top = `${geometry.y}px`;
      el.style.width = `${geometry.width}px`;
      el.style.height = `${geometry.height}px`;
    }

    const minSize = this._getProperty(widgetNode, "minimumSize");
    if (minSize) {
      if (minSize.width > 0) el.style.minWidth = `${minSize.width}px`;
      if (minSize.height > 0) el.style.minHeight = `${minSize.height}px`;
    }

    const maxSize = this._getProperty(widgetNode, "maximumSize");
    if (maxSize) {
      if (maxSize.width > 0 && maxSize.width < 16777215) el.style.maxWidth = `${maxSize.width}px`;
      if (maxSize.height > 0 && maxSize.height < 16777215) el.style.maxHeight = `${maxSize.height}px`;
    }

    // Process ToolTip / StatusTip
    const toolTipText = this._getProperty(widgetNode, "toolTip");
    if (toolTipText) {
      const transTip = this._translate(toolTipText, `${widgetName}.toolTip`, options);
      el.setAttribute("title", transTip);
      if (toolTipText.startsWith("@") || options.translationResolver) {
        el.setAttribute("data-quiht-tooltip-key", toolTipText.startsWith("@") ? toolTipText.substring(1) : `${widgetName}.toolTip`);
      }
    }

    const statusTipText = this._getProperty(widgetNode, "statusTip");
    if (statusTipText) {
      const transStatus = this._translate(statusTipText, `${widgetName}.statusTip`, options);
      el.setAttribute("data-statustip", transStatus);
      if (statusTipText.startsWith("@") || options.translationResolver) {
        el.setAttribute("data-quiht-statustip-key", statusTipText.startsWith("@") ? statusTipText.substring(1) : `${widgetName}.statusTip`);
      }
    }

    // Process children and layouts
    const targetContainer = contentContainer || el;

    // Check if it has a layout
    const layoutNode = widgetNode.querySelector(":scope > layout");
    if (layoutNode) {
      this._renderLayout(layoutNode, targetContainer, options);
    } else {
      // Process simple child widgets
      const childWidgetNodes = widgetNode.querySelectorAll(":scope > widget");
      childWidgetNodes.forEach(childNode => {
        const childEl = this._renderWidget(childNode, options);
        targetContainer.appendChild(childEl);
      });
    }

    return el;
  }

  /**
   * Renders a layout container and populates items
   * @param {Element} layoutNode
   * @param {HTMLElement} parentEl
   * @param {object} options
   */
  static _renderLayout(layoutNode, parentEl, options) {
    const layoutClass = layoutNode.getAttribute("class") || "QVBoxLayout";
    const layoutName = layoutNode.getAttribute("name") || "";

    const layoutContainer = document.createElement("div");
    layoutContainer.className = `q-layout ${layoutName}`;
    parentEl.appendChild(layoutContainer);

    // Apply layout-specific classes
    if (layoutClass === "QVBoxLayout") {
      layoutContainer.classList.add("q-vbox-layout");
    } else if (layoutClass === "QHBoxLayout") {
      layoutContainer.classList.add("q-hbox-layout");
    } else if (layoutClass === "QGridLayout") {
      layoutContainer.classList.add("q-grid-layout");
    }

    // Spacing
    const spacing = this._getProperty(layoutNode, "spacing");
    if (spacing !== null) {
      layoutContainer.style.gap = `${spacing}px`;
    }

    // Margins
    const leftMargin = this._getProperty(layoutNode, "leftMargin") ?? 0;
    const rightMargin = this._getProperty(layoutNode, "rightMargin") ?? 0;
    const topMargin = this._getProperty(layoutNode, "topMargin") ?? 0;
    const bottomMargin = this._getProperty(layoutNode, "bottomMargin") ?? 0;
    layoutContainer.style.padding = `${topMargin}px ${rightMargin}px ${bottomMargin}px ${leftMargin}px`;

    // Process Items
    const itemNodes = layoutNode.querySelectorAll(":scope > item");
    
    // For QTabWidget, pages might be added as items with layout attributes
    const parentClass = parentEl.parentNode?.getAttribute("data-q-class");

    itemNodes.forEach((itemNode, index) => {
      // Check grid layout positioning
      const row = itemNode.getAttribute("row");
      const column = itemNode.getAttribute("column");
      const rowSpan = itemNode.getAttribute("rowspan");
      const colSpan = itemNode.getAttribute("colspan");

      // Render the item's content: widget, layout, or spacer
      let itemEl = null;

      const childWidget = itemNode.querySelector(":scope > widget");
      const childLayout = itemNode.querySelector(":scope > layout");
      const childSpacer = itemNode.querySelector(":scope > spacer");

      if (childWidget) {
        itemEl = this._renderWidget(childWidget, options);
      } else if (childLayout) {
        itemEl = document.createElement("div");
        itemEl.className = "q-nested-layout-wrapper";
        this._renderLayout(childLayout, itemEl, options);
      } else if (childSpacer) {
        itemEl = document.createElement("div");
        itemEl.className = "q-spacer";
        const orientation = childSpacer.querySelector("property[name=\"orientation\"]")?.textContent || "";
        const size = this._getProperty(childSpacer, "size");
        if (size) {
          if (orientation.includes("Horizontal")) {
            itemEl.style.width = `${size.width}px`;
            itemEl.style.height = "1px";
            itemEl.style.flexGrow = "0";
            itemEl.style.flexShrink = "0";
          } else {
            itemEl.style.height = `${size.height}px`;
            itemEl.style.width = "1px";
            itemEl.style.flexGrow = "0";
            itemEl.style.flexShrink = "0";
          }
        } else {
          itemEl.style.flexGrow = "1";
        }
      }

      if (itemEl) {
        // Tab widget special page wrapper
        if (parentClass === "QTabWidget") {
          const tabTitle = itemNode.querySelector("attribute[name=\"title\"]")?.textContent || `Tab ${index + 1}`;
          const translatedTabTitle = this._translate(tabTitle, "", options);
          
          // Append Tab Button
          const tabBar = parentEl.parentNode.querySelector(".q-tab-bar");
          const tabBtn = document.createElement("li");
          tabBtn.className = `q-tab-button ${index === 0 ? "active" : ""}`;
          tabBtn.setAttribute("data-index", index);
          tabBtn.textContent = translatedTabTitle;
          tabBar.appendChild(tabBtn);

          // Wrap page item
          const pageWrapper = document.createElement("div");
          pageWrapper.className = `q-tab-page ${index === 0 ? "active" : ""}`;
          pageWrapper.appendChild(itemEl);
          layoutContainer.appendChild(pageWrapper);
        } else {
          // General layout item
          layoutContainer.appendChild(itemEl);
        }

        // Apply grid positioning styles
        if (layoutClass === "QGridLayout" && row !== null && column !== null) {
          const r = parseInt(row) + 1; // CSS grid starts at 1
          const c = parseInt(column) + 1;
          const rs = rowSpan ? parseInt(rowSpan) : 1;
          const cs = colSpan ? parseInt(colSpan) : 1;
          
          itemEl.style.gridRow = `${r} / span ${rs}`;
          itemEl.style.gridColumn = `${c} / span ${cs}`;
        }
      }
    });
  }
}
