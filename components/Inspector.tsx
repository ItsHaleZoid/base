"use client";
import { useEffect, useState } from "react";

// --- HELPER: Dig into React Internals ---
function getReactSource(element: HTMLElement) {
  // React stores data on the DOM node using a key starting with "__reactFiber$"
  const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
  
  if (!key) return null;
  
  // @ts-ignore
  const fiber = element[key];
  
  // _debugSource contains { fileName, lineNumber } in Dev Mode
  // If not found immediately, we traverse up the tree to find the nearest component
  let currentFiber = fiber;
  while (currentFiber) {
      if (currentFiber._debugSource) {
          return currentFiber._debugSource;
      }
      currentFiber = currentFiber.return;
  }
  return null;
}

export function Inspector() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "TOGGLE_INSPECT") {
        setActive(event.data.isInspectMode);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!active) {
      document.body.style.cursor = "default";
      return;
    }

    const handleMouseOver = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (target === document.body || target === document.documentElement) return;
      
      target.style.outline = "2px solid #3b82f6";
      target.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
      target.style.cursor = "crosshair";
    };

    const handleMouseOut = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      target.style.outline = "";
      target.style.backgroundColor = "";
    };

    const handleClick = (e: MouseEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;
      
      // 1. Get the Source Info (File Path & Line Number)
      const source = getReactSource(target);
      
      console.log("🎯 React Source:", source);

      // 2. Send to Parent
      window.parent.postMessage({ 
        type: 'ELEMENT_SELECTED', 
        tagName: target.tagName.toLowerCase(),
        // This is the Magic Data:
        fileName: source?.fileName || null, 
        lineNumber: source?.lineNumber || null,
        // Fallback code
        code: target.outerHTML 
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

  return null;
}