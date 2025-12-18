"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { getSourceFromDomId, preloadDomIdMap } from "@/lib/dom-id-map";

// --- Types ---
interface ElementSource {
  fileName: string | null;
  componentName?: string | null;
  jsxCode?: string | null; // The actual React/JSX code for this element
  lineNumber?: number | null; // Line number in source file
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

interface InspectedElement {
  element: HTMLElement;
  source: ElementSource;
  signature: ElementSignature;
}

// --- HELPER: Extract line number from domId ---
// domId format: "dom-{relativePath}:{line}:{column}-{counter}"
function extractLineNumberFromDomId(domId: string): number | null {
  // Example: "dom-app/page.tsx:5:10-1" -> 5
  // Match pattern: dom-{path}:{line}:{column}-{counter}
  const match = domId.match(/^dom-[^:]+:(\d+):\d+-\d+$/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

// --- HELPER: Extract source from domId (highest priority) ---
function getSourceFromDomIdAttribute(element: HTMLElement): ElementSource | null {
  let current: HTMLElement | null = element;
  let depth = 0;
  const maxDepth = 10;

  while (current && depth < maxDepth) {
    // Check for data-dom-id attribute (injected by Babel plugin)
    const domId = current.getAttribute('data-dom-id');

    if (domId) {
      const mapping = getSourceFromDomId(domId);
      if (mapping) {
        return {
          fileName: mapping.fileName,
          jsxCode: mapping.jsxCode || null,
          lineNumber: extractLineNumberFromDomId(domId),
        };
      }
    }

    current = current.parentElement;
    depth++;
  }
  return null;
}

// --- HELPER: Extract source from data attributes ---
function getSourceFromDataAttributes(element: HTMLElement): ElementSource | null {
  let current: HTMLElement | null = element;
  let depth = 0;
  const maxDepth = 10;
  
  while (current && depth < maxDepth) {
    // Check for new inspector attributes
    const relativePath = current.getAttribute('data-inspector-relative-path') || 
                        current.getAttribute('data-file-path') ||
                        current.getAttribute('data-source-file');
    const line = current.getAttribute('data-inspector-line') || 
                current.getAttribute('data-line-number') ||
                current.getAttribute('data-source-line');
    const column = current.getAttribute('data-inspector-column') ||
                  current.getAttribute('data-column-number') ||
                  current.getAttribute('data-source-column');
    
    if (relativePath) {
      return {
        fileName: relativePath,
      };
    }
    
    // Legacy data attributes
    const dataFile = current.getAttribute('data-file');
    
    if (dataFile) {
      return {
        fileName: dataFile,
      };
    }
    
    current = current.parentElement;
    depth++;
  }
  return null;
}

// --- HELPER: Try to extract component name from React Fiber ---
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
        // Check for React 18+ structure
        if (current.type) {
          if (typeof current.type === 'function') {
            return current.type.name || current.type.displayName || current.type.$$typeof?.toString() || 'Anonymous';
          }
          if (typeof current.type === 'string') {
            return current.type;
          }
          // Check for forwardRef
          if (current.type.render) {
            return current.type.render.name || current.type.render.displayName || 'ForwardRef';
          }
        }
        
        // Check for _debugSource (React DevTools)
        if (current._debugSource) {
          return current._debugSource.fileName || null;
        }
        
        // Check for memoized component
        if (current.memoizedState) {
          const state = current.memoizedState;
          if (state.element?.type) {
            const type = state.element.type;
            if (typeof type === 'function') {
              return type.name || type.displayName || null;
            }
          }
        }
        
        current = current.return || current._owner;
        depth++;
      }
    }
  } catch (err) {
    // Silently fail - this is expected in some environments
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
        // React DevTools stores source info here
        if (current._debugSource) {
          return {
            fileName: current._debugSource.fileName || null,
            componentName: getComponentName(element),
          };
        }
        
        // Check parent fibers
        current = current.return || current._owner;
        depth++;
      }
    }
  } catch (err) {
    // Silently fail
  }
  return null;
}

// --- HELPER: Parse stack trace ---
function getSourceFromStackTrace(): ElementSource | null {
  try {
    const error = new Error();
    if (!error.stack) return null;
    
    const lines = error.stack.split('\\n');
    const skipPatterns = [
      'node_modules/react',
      'node_modules/next',
      'Inspector',
      'at Object.',
      'at eval',
    ];
    
    for (const line of lines) {
      // Skip framework code
      if (skipPatterns.some(pattern => line.includes(pattern))) continue;
      
      // Match various stack trace formats
      const patterns = [
        /at\\s+.*?\\s*\\((.+?):(\\d+):(\\d+)\\)/,
        /(@|at\\s+)(.+?):(\\d+):(\\d+)/,
        /\\((.+?):(\\d+):(\\d+)\\)/,
      ];
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const fileName = match[1] || match[2] || match[3];
          const lineNum = match[2] || match[3] || match[4];
          const colNum = match[3] || match[4] || match[5];
          
          if (fileName && !fileName.includes('node_modules') && !fileName.includes('webpack')) {
            return {
              fileName: fileName.trim(),
            };
          }
        }
      }
    }
  } catch (err) {
    // Silently fail
  }
  return null;
}

// --- HELPER: Extract element signature for code matching ---
function extractElementSignature(element: HTMLElement): ElementSignature {
  const tagName = element.tagName.toLowerCase();
  
  // Get className
  let className = "";
  if (typeof element.className === 'string') {
    className = element.className;
  } else if ((element.className as any)?.baseVal) {
    // SVG elements
    className = (element.className as any).baseVal;
  } else if (element.getAttribute) {
    className = element.getAttribute("class") || "";
  }
  
  // Get ID
  const id = element.id || element.getAttribute("id") || "";
  
  // Get text content (normalized)
  const textContent = (element.innerText || element.textContent || "")
    .trim()
    .replace(/\\s+/g, ' ')
    .substring(0, 200); // Limit length
  
  // Get HTML
  const innerHTML = element.innerHTML || "";
  const outerHTML = element.outerHTML || "";
  
  // Extract all attributes
  const attributes: Record<string, string> = {};
  if (element.attributes) {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.name] = attr.value;
    }
  }
  
  // Get computed styles (useful for matching)
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
  // Priority 1: domId mapping (most reliable - injected at build time)
  const domIdSource = getSourceFromDomIdAttribute(element);
  if (domIdSource && domIdSource.fileName) {
    return {
      ...domIdSource,
      componentName: getComponentName(element),
    };
  }
  
  // Priority 2: Data attributes
  const dataAttrSource = getSourceFromDataAttributes(element);
  if (dataAttrSource && dataAttrSource.fileName) {
    return {
      ...dataAttrSource,
      componentName: getComponentName(element),
    };
  }
  
  // Priority 3: React DevTools source
  const devToolsSource = getReactDevToolsSource(element);
  if (devToolsSource && devToolsSource.fileName) {
    return devToolsSource;
  }
  
  // Priority 4: Stack trace (fallback)
  const stackSource = getSourceFromStackTrace();
  if (stackSource && stackSource.fileName) {
    return {
      ...stackSource,
      componentName: getComponentName(element),
    };
  }
  
  // Priority 5: Component name only
  const componentName = getComponentName(element);
  if (componentName) {
    return {
      fileName: `<${componentName}>`,
      componentName,
    };
  }
  
  // Fallback: return null values
  return {
    fileName: null,
    componentName: null,
  };
}

export function Inspector() {
  const [active, setActive] = useState(false);
  
  // Direct DOM refs for 60fps performance
  const hoverOverlayRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  
  const selectedOverlayRef = useRef<HTMLDivElement>(null);
  const selectedLabelRef = useRef<HTMLDivElement>(null);
  
  const selectedTargetRef = useRef<HTMLElement | null>(null);
  const hoverTargetRef = useRef<HTMLElement | null>(null);

  // Preload domId mapping on mount
  useEffect(() => {
    preloadDomIdMap();
  }, []);

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
    const top = rect.top + window.scrollY;
    const left = rect.left + window.scrollX;
    
    // Move the blue box
    overlay.style.opacity = "1";
    overlay.style.transform = "scale(1)";
    overlay.style.top = `${top}px`;
    overlay.style.left = `${left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    // Update the Tag Name Label
    if (label) {
      const tagName = target.tagName.toLowerCase();
      const componentName = getComponentName(target);
      const displayName = componentName || tagName;
      
      // Truncate if too long
      label.textContent = displayName.length > 20 
        ? displayName.substring(0, 17) + '...' 
        : displayName;
    }
  }, []);

  // Helper function to extract and send element data
  const sendElementData = useCallback((target: HTMLElement, messageType: string) => {
    const source = getReactSource(target);
    const signature = extractElementSignature(target);

    // Get className safely
    let className = "";
    if (typeof target.className === 'string') {
      className = target.className;
    } else if ((target.className as any)?.baseVal) {
      className = (target.className as any).baseVal;
    } else if (target.getAttribute) {
      className = target.getAttribute("class") || "";
    }

    const safeText = (target.innerText || target.textContent || "").trim();

    window.parent.postMessage({
      type: messageType,
      tagName: target.tagName.toLowerCase(),
      className: className,
      innerText: safeText.substring(0, 200),
      outerHTML: target.outerHTML.substring(0, 500),
      fileName: source.fileName,
      componentName: source.componentName,
      jsxCode: source.jsxCode || null,
      lineNumber: source.lineNumber || null,
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

      // Handle style updates from parent (live preview)
      if (event.data?.type === "UPDATE_ELEMENT_STYLE") {
        const { domId, property, cssValue } = event.data;

        if (!domId || !property) {
          console.warn("[Inspector] UPDATE_ELEMENT_STYLE missing domId or property", event.data);
          return;
        }

        const element = document.querySelector(`[data-dom-id="${domId}"]`) as HTMLElement;

        if (element) {
          // Handle textContent as a special case
          if (property === 'textContent') {
            element.textContent = cssValue;
          } else {
            // Apply the CSS property directly for instant preview
            (element.style as any)[property] = cssValue;
          }
          console.log("[Inspector] ✅ Applied style:", { domId, property, cssValue });

          // Notify parent that style was applied
          window.parent.postMessage({
            type: 'STYLE_APPLIED',
            domId,
            property,
            cssValue,
          }, '*');
        } else {
          console.warn("[Inspector] Element not found for domId:", domId);
          window.parent.postMessage({
            type: 'STYLE_APPLY_FAILED',
            domId,
            property,
            error: 'Element not found',
          }, '*');
        }
      }

      // Handle refresh request from parent
      if (event.data?.type === "GET_SELECTED_ELEMENT") {
        const target = selectedTargetRef.current;

        // Check if element still exists in DOM
        if (!target || !document.contains(target)) {
          window.parent.postMessage({
            type: 'ELEMENT_STALE',
            message: 'Selected element no longer exists in DOM'
          }, '*');
          return;
        }

        // Re-fetch DOM ID map in case it was updated after hot reload
        preloadDomIdMap().then(() => {
          sendElementData(target, 'ELEMENT_REFRESHED');
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [updateOverlay, sendElementData]);

  // MutationObserver to watch selected element for changes and auto-send updates
  useEffect(() => {
    const target = selectedTargetRef.current;
    if (!target || !active) return;

    const observer = new MutationObserver((mutations) => {
      // Check if element still exists
      if (!document.contains(target)) {
        window.parent.postMessage({
          type: 'ELEMENT_STALE',
          message: 'Selected element was removed from DOM'
        }, '*');
        observer.disconnect();
        return;
      }

      // Send updated element data
      sendElementData(target, 'ELEMENT_UPDATED');
    });

    observer.observe(target, {
      attributes: true,
      attributeFilter: ['class', 'style', 'className'],
      characterData: true,
      childList: false, // Don't watch children to avoid too many updates
    });

    return () => observer.disconnect();
  }, [active, sendElementData, selectedTargetRef.current]);

  useEffect(() => {
    if (!active) {
      document.body.style.cursor = "default";
      if (hoverOverlayRef.current) hoverOverlayRef.current.style.opacity = "0";
      if (selectedOverlayRef.current) selectedOverlayRef.current.style.opacity = "0";

      // Clean up crosshair cursor from all elements
      document.querySelectorAll('*').forEach((el) => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.style.cursor === 'crosshair') {
          htmlEl.style.cursor = '';
        }
      });
      return;
    }

    // Set crosshair cursor when active
    document.body.style.cursor = "crosshair";

    const handleMouseOver = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      
      // Skip inspector elements and body
      if (target === document.body || 
          target === document.documentElement || 
          target.id?.includes('inspector-') ||
          target.closest('#inspector-hover-overlay') ||
          target.closest('#inspector-selected-overlay')) {
        return;
      }

      target.style.cursor = "crosshair";
      hoverTargetRef.current = target;

      // If hovering over the selected item, hide the hover overlay
      if (target !== selectedTargetRef.current) {
        updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, target);
      } else {
        updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      
      // Only clear if we're leaving the hovered element
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

      // Skip inspector elements
      if (target.id?.includes('inspector-') ||
          target.closest('#inspector-hover-overlay') ||
          target.closest('#inspector-selected-overlay')) {
        return;
      }

      selectedTargetRef.current = target;

      // Move "Selected" Overlay & Label
      updateOverlay(selectedOverlayRef.current, selectedLabelRef.current, target);

      // Hide Hover overlay
      updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);

      // Send element data using the helper
      sendElementData(target, 'ELEMENT_SELECTED');
    };

    // Use capture phase to catch events early
    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.body.style.cursor = "default";
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [active, updateOverlay, sendElementData]);

  if (!active) return null;

  return (
    <>
      {/* --- HOVER OVERLAY (Dashed + Label) --- */}
      <div 
        ref={hoverOverlayRef}
        id="inspector-hover-overlay"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 999998,
          border: "1px dashed #3b82f6",
          backgroundColor: "transparent",
          transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: 0,
          willChange: "transform, opacity",
          userSelect: "none",
        }}
      >
        {/* Label sits INSIDE so it glides with the box */}
        <div 
          ref={hoverLabelRef}
          style={{
            position: "absolute",
            top: "-22px",
            left: "-2px",
            background: "#d1d5db",
            color: "#000000",
            fontSize: "11px",
            fontFamily: "Inter",
            padding: "4px 6px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            marginBottom: "12px",
            fontWeight: "500",
            borderRadius: "6px",
            userSelect: "none",
          }}
        />
      </div>

      {/* --- SELECTED OVERLAY (Solid + Label) --- */}
      <div 
        ref={selectedOverlayRef}
        id="inspector-selected-overlay"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 999999,
          border: "1px solid #2563eb",
          backgroundColor: "transparent",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: 0,
          willChange: "transform, opacity",
          userSelect: "none",
        }}
      >
        <div 
          ref={selectedLabelRef}
          style={{
            position: "absolute",
            top: "-26px",
            left: "-3px",
            background: "#d1d5db",
            color: "#000000",
            fontSize: "12px",
            fontWeight: "500",
            borderRadius: "6px",
            fontFamily: "Inter",
            padding: "3px 8px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            marginBottom: "12px",
            userSelect: "none",
          }}
        />
      </div>
    </>
  );
}