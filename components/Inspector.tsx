"use client";
import { useEffect, useState, useRef } from "react";

// --- HELPER: Extract source from data attributes ---
function getSourceFromDataAttributes(element: HTMLElement) {
  let current: HTMLElement | null = element;
  while (current) {
    const relativePath = current.getAttribute('data-inspector-relative-path');
    const line = current.getAttribute('data-inspector-line');
    if (relativePath && line) {
      return {
        fileName: relativePath,
        lineNumber: parseInt(line, 10),
        columnNumber: undefined
      };
    }
    const dataFile = current.getAttribute('data-file');
    const dataLine = current.getAttribute('data-line');
    if (dataFile) {
      return {
        fileName: dataFile,
        lineNumber: dataLine ? parseInt(dataLine, 10) : undefined,
        columnNumber: undefined
      };
    }
    current = current.parentElement;
  }
  return null;
}

// --- HELPER: Try to extract component name from React Fiber ---
function getComponentName(element: HTMLElement): string | null {
  try {
    const keys = Object.keys(element);
    const fiberKey = keys.find((k) => k.startsWith("__reactFiber$"));
    if (fiberKey) {
      // @ts-ignore
      let fiber = element[fiberKey];
      let current = fiber;
      let depth = 0;
      while (current && depth < 20) {
        if (current.type) {
          if (typeof current.type === 'function') {
            return current.type.name || current.type.displayName || 'Anonymous';
          }
          if (typeof current.type === 'string') {
            return current.type;
          }
        }
        current = current.return;
        depth++;
      }
    }
  } catch (err) {}
  return null;
}

// --- HELPER: Parse stack trace ---
function getSourceFromStackTrace(): { fileName: string; lineNumber: number } | null {
  try {
    const error = new Error();
    if (!error.stack) return null;
    const lines = error.stack.split('\n');
    for (const line of lines) {
      if (line.includes('node_modules/react') || line.includes('Inspector')) continue;
      const match = line.match(/at\s+.*?\s*\((.+?):(\d+):(\d+)\)/) || line.match(/(@|at\s+)(.+?):(\d+):(\d+)/);
      if (match) {
        const fileName = match[1] || match[2];
        if (fileName && !fileName.includes('node_modules')) return { fileName, lineNumber: parseInt(match[2] || match[3], 10) };
      }
    }
  } catch (err) {}
  return null;
}

// --- MAIN SOURCE FINDER ---
function getReactSource(element: HTMLElement) {
  const dataAttrSource = getSourceFromDataAttributes(element);
  if (dataAttrSource) return dataAttrSource;
  
  const componentName = getComponentName(element);
  const stackSource = getSourceFromStackTrace();
  if (stackSource) return stackSource;
  
  // Legacy React 18 check
  try {
    let current: HTMLElement | null = element;
    let attempts = 0;
    while (current && attempts < 30) {
      attempts++;
      const keys = Object.keys(current);
      const fiberKey = keys.find((k) => k.startsWith("__reactFiber$"));
      if (fiberKey) {
        // @ts-ignore
        let fiber = current[fiberKey];
        while (fiber) {
          if (fiber._debugSource) return fiber._debugSource;
          fiber = fiber.return;
        }
      }
      current = current.parentElement;
    }
  } catch (err) {}
  
  return componentName ? { fileName: `<${componentName}>`, lineNumber: null, columnNumber: null } : null;
}

export function Inspector() {
  const [active, setActive] = useState(false);
  
  // Direct DOM refs for 60fps performance
  const hoverOverlayRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  
  const selectedOverlayRef = useRef<HTMLDivElement>(null);
  const selectedLabelRef = useRef<HTMLDivElement>(null);
  
  const selectedTargetRef = useRef<HTMLElement | null>(null);

  const updateOverlay = (
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

    // Update the Tag Name Label (e.g. "div" or "button")
    if (label) {
      const tagName = target.tagName.toLowerCase();
      const componentName = getComponentName(target);
      // Show "Button" if component name exists, otherwise "button"
      label.textContent = componentName ? componentName : tagName;
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "TOGGLE_INSPECT") {
        setActive(event.data.isInspectMode);
        if (!event.data.isInspectMode) {
           selectedTargetRef.current = null;
           updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);
           updateOverlay(selectedOverlayRef.current, selectedLabelRef.current, null);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

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
      
      if (target === document.body || target === document.documentElement || 
          target.id.includes('inspector-')) return;

      target.style.cursor = "default";

      // If hovering over the selected item, hide the hover overlay
      if (target !== selectedTargetRef.current) {
        updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, target);
      } else {
        updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      e.stopPropagation();
      updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);
    };

    const handleClick = (e: MouseEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;

      selectedTargetRef.current = target;

      // Move "Selected" Overlay & Label
      updateOverlay(selectedOverlayRef.current, selectedLabelRef.current, target);
      
      // Hide Hover overlay
      updateOverlay(hoverOverlayRef.current, hoverLabelRef.current, null);

      const source = getReactSource(target);
      console.log("🎯 Selected:", target);

      let className = "";
      if (typeof target.className === 'string') {
        className = target.className;
      } else if (target.getAttribute) {
        className = target.getAttribute("class") || "";
      }

      const safeText = target.innerText || target.textContent || "";

      window.parent.postMessage({
        type: 'ELEMENT_SELECTED',
        tagName: target.tagName.toLowerCase(),
        fileName: source?.fileName || null,
        lineNumber: source?.lineNumber || null,
        columnNumber: source?.columnNumber || null,
        code: target.outerHTML,
        className: className,
        innerText: safeText.substring(0, 100),
        componentName: getComponentName(target)
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
  }, [active]);

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
          border: "2px dashed #3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: 0,
          borderRadius: "4px"
        }}
      >
        {/* Label sits INSIDE so it glides with the box */}
        <div 
          ref={hoverLabelRef}
          style={{
            position: "absolute",
            top: "-22px",
            left: "-2px",
            background: "#3b82f6",
            color: "white",
            fontSize: "11px",
            fontFamily: "monospace",
            padding: "2px 6px",
            borderRadius: "3px",
            pointerEvents: "none",
            whiteSpace: "nowrap"
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
          border: "3px solid #3b82f6",
          backgroundColor: "rgba(59, 130, 246, 0.05)",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: 0,
          borderRadius: "4px",
          boxShadow: "0 4px 12px rgba(59, 130, 246, 0.25)"
        }}
      >
        <div 
          ref={selectedLabelRef}
          style={{
            position: "absolute",
            top: "-24px", // Slightly higher for hierarchy
            left: "-3px",
            background: "#2563eb", // Darker blue for selected state
            color: "white",
            fontSize: "12px",
            fontWeight: "bold",
            fontFamily: "monospace",
            padding: "2px 8px",
            borderRadius: "3px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}
        />
      </div>
    </>
  );
}