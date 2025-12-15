"use client";
import { useEffect, useState, useRef, useCallback } from "react";

// --- Types ---
interface ElementSource {
  fileName: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  componentName?: string | null;
  jsxCode?: string;  // Reconstructed JSX from element
}

interface ElementSignature {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  innerHTML: string;
  outerHTML: string;
  attributes: Record<string, string>;
  computedStyles?: {
    fontSize?: string;
    color?: string;
    backgroundColor?: string;
    fontWeight?: string;
    textAlign?: string;
  };
}

// --- NEW: Reconstruct JSX from DOM element ---
function reconstructJSX(element: HTMLElement, depth: number = 0, maxDepth: number = 3): string {
  if (depth > maxDepth) {
    return '...';
  }

  const tagName = element.tagName.toLowerCase();
  const indent = '  '.repeat(depth);
  
  // Get attributes
  const attrs: string[] = [];
  
  // Get className (handle different formats)
  let className = '';
  if (typeof element.className === 'string') {
    className = element.className;
  } else if ((element.className as any)?.baseVal) {
    className = (element.className as any).baseVal;
  } else if (element.getAttribute) {
    className = element.getAttribute('class') || '';
  }
  
  if (className) {
    // Split classes and format nicely
    const classes = className.trim().split(/\s+/).filter(Boolean);
    if (classes.length > 0) {
      attrs.push(`className="${classes.join(' ')}"`);
    }
  }
  
  // Get other attributes (skip React internal and data attributes)
  if (element.attributes) {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      
      // Skip certain attributes
      if (attr.name === 'class' || 
          attr.name.startsWith('data-react') ||
          attr.name.startsWith('data-__react') ||
          attr.name.startsWith('__react') ||
          attr.name === 'style') continue;
      
      // Convert attribute names to camelCase for JSX
      let attrName = attr.name;
      if (attrName.includes('-')) {
        attrName = attrName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      }
      
      // Handle boolean attributes
      if (attr.value === '' || attr.value === attr.name) {
        attrs.push(attrName);
      } else {
        attrs.push(`${attrName}="${attr.value}"`);
      }
    }
  }
  
  // Get inline styles
  const styleAttr = element.getAttribute('style');
  if (styleAttr) {
    attrs.push(`style={{ ${styleAttr} }}`);
  }
  
  // Build opening tag
  const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  
  // Check if element has children
  const children = Array.from(element.childNodes);
  
  // Filter out text nodes that are just whitespace
  const meaningfulChildren = children.filter(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      return child.textContent?.trim().length;
    }
    return true;
  });
  
  // Self-closing tags
  const selfClosingTags = ['img', 'br', 'hr', 'input', 'meta', 'link'];
  if (selfClosingTags.includes(tagName) || meaningfulChildren.length === 0) {
    return `${indent}<${tagName}${attrsStr} />`;
  }
  
  // Has only text content
  if (meaningfulChildren.length === 1 && meaningfulChildren[0].nodeType === Node.TEXT_NODE) {
    const text = meaningfulChildren[0].textContent?.trim() || '';
    if (text.length < 50) {
      return `${indent}<${tagName}${attrsStr}>${text}</${tagName}>`;
    }
  }
  
  // Has child elements
  let jsx = `${indent}<${tagName}${attrsStr}>\n`;
  
  for (const child of meaningfulChildren) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) {
        jsx += `${indent}  {${JSON.stringify(text)}}\n`;
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      jsx += reconstructJSX(child as HTMLElement, depth + 1, maxDepth) + '\n';
    }
  }
  
  jsx += `${indent}</${tagName}>`;
  
  return jsx;
}

// --- HELPER: Extract component name from React Fiber ---
function getComponentName(element: HTMLElement): string | null {
  try {
    const keys = Object.keys(element);
    const fiberKey = keys.find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
    
    if (fiberKey) {
      // @ts-ignore
      let fiber = element[fiberKey];
      let current = fiber;
      let depth = 0;
      const maxDepth = 30;
      
      while (current && depth < maxDepth) {
        if (current.type) {
          if (typeof current.type === 'function') {
            return current.type.name || current.type.displayName || 'Anonymous';
          }
          if (typeof current.type === 'string') {
            return current.type;
          }
          if (current.type.render) {
            return current.type.render.name || current.type.render.displayName || 'ForwardRef';
          }
        }
        
        if (current._debugSource) {
          return current._debugSource.fileName || null;
        }
        
        current = current.return || current._owner;
        depth++;
      }
    }
  } catch (err) {
    // Silently fail
  }
  return null;
}

// --- HELPER: Extract source from data attributes ---
function getSourceFromDataAttributes(element: HTMLElement): ElementSource | null {
  try {
    const fileName = element.getAttribute('data-source-file') || 
                     element.getAttribute('data-file') ||
                     element.getAttribute('data-filename');
    const lineNumber = element.getAttribute('data-source-line') || 
                       element.getAttribute('data-line');
    const columnNumber = element.getAttribute('data-source-column') || 
                         element.getAttribute('data-column');
    const componentName = element.getAttribute('data-component-name') ||
                          element.getAttribute('data-component');
    
    if (fileName) {
      return {
        fileName,
        lineNumber: lineNumber ? parseInt(lineNumber, 10) : null,
        columnNumber: columnNumber ? parseInt(columnNumber, 10) : null,
        componentName: componentName || null,
      };
    }
  } catch (err) {
    // Silently fail
  }
  return null;
}

// --- HELPER: Extract React DevTools source info ---
function getReactDevToolsSource(element: HTMLElement): ElementSource | null {
  try {
    const keys = Object.keys(element);
    const fiberKey = keys.find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
    
    if (fiberKey) {
      // @ts-ignore
      let fiber = element[fiberKey];
      let current = fiber;
      let depth = 0;
      const maxDepth = 30;
      
      while (current && depth < maxDepth) {
        if (current._debugSource) {
          return {
            fileName: current._debugSource.fileName || null,
            lineNumber: current._debugSource.lineNumber || null,
            columnNumber: current._debugSource.columnNumber || null,
            componentName: getComponentName(element),
          };
        }
        
        current = current.return || current._owner;
        depth++;
      }
    }
  } catch (err) {
    // Silently fail
  }
  return null;
}

// --- HELPER: Extract element signature ---
function extractElementSignature(element: HTMLElement): ElementSignature {
  const tagName = element.tagName.toLowerCase();
  
  let className = "";
  if (typeof element.className === 'string') {
    className = element.className;
  } else if ((element.className as any)?.baseVal) {
    className = (element.className as any).baseVal;
  } else if (element.getAttribute) {
    className = element.getAttribute("class") || "";
  }
  
  const id = element.id || element.getAttribute("id") || "";
  const textContent = (element.innerText || element.textContent || "")
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, 200);
  
  const innerHTML = element.innerHTML || "";
  const outerHTML = element.outerHTML || "";
  
  const attributes: Record<string, string> = {};
  if (element.attributes) {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.name] = attr.value;
    }
  }
  
  const computedStyles: ElementSignature['computedStyles'] = {};
  try {
    const styles = window.getComputedStyle(element);
    computedStyles.fontSize = styles.fontSize;
    computedStyles.color = styles.color;
    computedStyles.backgroundColor = styles.backgroundColor;
    computedStyles.fontWeight = styles.fontWeight;
    computedStyles.textAlign = styles.textAlign;
  } catch (err) {
    // Cross-origin or other issues
  }
  
  return {
    tagName,
    className,
    id,
    textContent,
    innerHTML,
    outerHTML,
    attributes,
    computedStyles,
  };
}

// --- MAIN SOURCE FINDER ---
function getReactSource(element: HTMLElement): ElementSource {
  // Priority 1: Data attributes
  const dataAttrSource = getSourceFromDataAttributes(element);
  if (dataAttrSource && dataAttrSource.fileName) {
    return {
      ...dataAttrSource,
      componentName: dataAttrSource.componentName || getComponentName(element),
      jsxCode: reconstructJSX(element),
    };
  }
  
  // Priority 2: React DevTools source
  const devToolsSource = getReactDevToolsSource(element);
  if (devToolsSource && devToolsSource.fileName) {
    return {
      ...devToolsSource,
      jsxCode: reconstructJSX(element),
    };
  }
  
  // Priority 3: Component name only
  const componentName = getComponentName(element);
  if (componentName) {
    return {
      fileName: `<${componentName}>`,
      lineNumber: null,
      columnNumber: null,
      componentName,
      jsxCode: reconstructJSX(element),
    };
  }
  
  // Fallback
  return {
    fileName: null,
    lineNumber: null,
    columnNumber: null,
    componentName: null,
    jsxCode: reconstructJSX(element),
  };
}

export function Inspector() {
  const [active, setActive] = useState(false);
  
  const hoverOverlayRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  
  const selectedOverlayRef = useRef<HTMLDivElement>(null);
  const selectedLabelRef = useRef<HTMLDivElement>(null);
  
  const selectedTargetRef = useRef<HTMLElement | null>(null);
  const hoverTargetRef = useRef<HTMLElement | null>(null);

  const updateOverlay = useCallback((
    overlay: HTMLDivElement | null, 
    label: HTMLDivElement | null,
    target: HTMLElement | null
  ) => {
    if (!overlay) return;
    
    if (!target) {
      overlay.style.opacity = "0";
      overlay.style.transform = "scale(0.95)";
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = 4;
    const top = rect.top + window.scrollY - padding;
    const left = rect.left + window.scrollX - padding;
    
    overlay.style.opacity = "1";
    overlay.style.transform = "scale(1)";
    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
    overlay.style.width = `${rect.width + (padding * 2)}px`;
    overlay.style.height = `${rect.height + (padding * 2)}px`;

    if (label) {
      const tagName = target.tagName.toLowerCase();
      const componentName = getComponentName(target);
      const displayName = componentName || tagName;
      
      label.textContent = displayName.length > 20 
        ? displayName.substring(0, 17) + '...' 
        : displayName;
    }
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "TOGGLE_INSPECT") {
        setActive(event.data.isInspectMode);
        if (!event.data.isInspectMode) {
          selectedTargetRef.current = null;
          hoverTargetRef.current = null;
          updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);
          updateOverlay(selectedOverlayRef.current, selectedLabelRef.current, null);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [updateOverlay]);

  useEffect(() => {
    if (!active) {
      document.body.style.cursor = "default";
      if (hoverOverlayRef.current) hoverOverlayRef.current.style.opacity = "0";
      if (selectedOverlayRef.current) selectedOverlayRef.current.style.opacity = "0";
      return;
    }

    const handleMouseOver = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      
      if (target === document.body || 
          target === document.documentElement || 
          target.id?.includes('inspector-') ||
          target.closest('#inspector-hover-overlay') ||
          target.closest('#inspector-selected-overlay')) {
        return;
      }

      target.style.cursor = "default";
      hoverTargetRef.current = target;

      if (target !== selectedTargetRef.current) {
        updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, target);
      } else {
        updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      
      if (target === hoverTargetRef.current) {
        hoverTargetRef.current = null;
        updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);
      }
    };

    const handleClick = (e: MouseEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;

      if (target.id?.includes('inspector-') ||
          target.closest('#inspector-hover-overlay') ||
          target.closest('#inspector-selected-overlay')) {
        return;
      }

      selectedTargetRef.current = target;
      updateOverlay(selectedOverlayRef.current, selectedLabelRef.current, target);
      updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);

      // Extract source information (synchronous - no API calls!)
      const source = getReactSource(target);
      const signature = extractElementSignature(target);

      let className = "";
      if (typeof target.className === 'string') {
        className = target.className;
      } else if ((target.className as any)?.baseVal) {
        className = (target.className as any).baseVal;
      } else if (target.getAttribute) {
        className = target.getAttribute("class") || "";
      }

      const safeText = (target.innerText || target.textContent || "").trim();

      console.log('📦 Element Selected:', {
        fileName: source.fileName,
        lineNumber: source.lineNumber,
        componentName: source.componentName,
        jsxCode: source.jsxCode,
      });

      // Send comprehensive element data INCLUDING RECONSTRUCTED JSX to parent
      window.parent.postMessage({
        type: 'ELEMENT_SELECTED',
        // Basic info
        tagName: target.tagName.toLowerCase(),
        className: className,
        innerText: safeText.substring(0, 200),
        outerHTML: target.outerHTML.substring(0, 500),
        
        // Source location
        fileName: source.fileName,
        lineNumber: source.lineNumber,
        columnNumber: source.columnNumber,
        componentName: source.componentName,
        
        // 🎉 RECONSTRUCTED JSX CODE (no API needed!)
        jsxCode: source.jsxCode,
        
        // Element signature
        signature: {
          tagName: signature.tagName,
          className: signature.className,
          id: signature.id,
          textContent: signature.textContent,
          attributes: signature.attributes,
          computedStyles: signature.computedStyles,
        },
        
        code: target.outerHTML.substring(0, 1000),
        rect: {
          top: target.getBoundingClientRect().top,
          left: target.getBoundingClientRect().left,
          width: target.getBoundingClientRect().width,
          height: target.getBoundingClientRect().height,
        },
      }, '*');
    };

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [active, updateOverlay]);

  if (!active) return null;

  return (
    <>
      {/* Hover Overlay */}
      <div 
        ref={hoverOverlayRef}
        id="inspector-hover-overlay"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 999998,
          outline: "2px dashed #3b82f6",
          outlineOffset: "0px",
          backgroundColor: "rgba(59, 130, 246, 0.08)",
          transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: 0,
          borderRadius: "4px",
          willChange: "transform, opacity",
        }}
      >
        <div 
          ref={hoverLabelRef}
          style={{
            position: "absolute",
            top: "-22px",
            left: "-2px",
            background: "#3b82f6",
            color: "white",
            fontSize: "11px",
            fontFamily: "Inter, system-ui, sans-serif",
            padding: "4px 6px",
            borderRadius: "3px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            marginBottom: "4px",
            fontWeight: "500",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        />
      </div>

      {/* Selected Overlay */}
      <div 
        ref={selectedOverlayRef}
        id="inspector-selected-overlay"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 999999,
          outline: "3px solid #2563eb",
          outlineOffset: "0px",
          backgroundColor: "rgba(37, 99, 235, 0.05)",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: 0,
          borderRadius: "4px",
          willChange: "transform, opacity",
          boxShadow: "0 0 0 1px rgba(37, 99, 235, 0.1)",
        }}
      >
        <div 
          ref={selectedLabelRef}
          style={{
            position: "absolute",
            top: "-26px",
            left: "-3px",
            background: "#2563eb",
            color: "white",
            fontSize: "12px",
            fontWeight: "600",
            fontFamily: "Inter, system-ui, sans-serif",
            padding: "3px 8px",
            borderRadius: "4px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            marginBottom: "4px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          }}
        />
      </div>
    </>
  );
}