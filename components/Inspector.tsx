"use client";
import { useEffect, useState } from "react";

// --- HELPER: Robust React Source Finder ---
function getReactSource(element: HTMLElement) {
  let currentElement: HTMLElement | null = element;

  // 1. Walk up the DOM tree until we find a node tracked by React
  while (currentElement) {
    const key = Object.keys(currentElement).find((k) => k.startsWith("__reactFiber$"));

    if (key) {
      // @ts-ignore
      let fiber = currentElement[key];

      // 2. Once we have a Fiber, walk up the React Tree to find the source file
      // (This skips internal divs to find the actual Component)
      while (fiber) {
        if (fiber._debugSource) {
          return fiber._debugSource; // Found it! { fileName, lineNumber }
        }
        fiber = fiber.return; // Go to parent component
      }
    }
    
    // If this node has no React info, check its parent
    currentElement = currentElement.parentElement;
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
      target.style.cursor = "";
    };

    const handleClick = (e: MouseEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;

      // 1. Use the robust finder
      const source = getReactSource(target);
      
      console.log("🎯 React Source Found:", source);

      // 2. Safely extract class/text (handling SVGs/Images correctly)
      let className = "";
      if (typeof target.className === 'string') {
        className = target.className;
      } else if (target.getAttribute) {
        // Handle SVGs where className is an object
        className = target.getAttribute("class") || "";
      }

      const safeText = target.innerText || target.textContent || "";

      // 3. Send to Parent
      window.parent.postMessage({
        type: 'ELEMENT_SELECTED',
        tagName: target.tagName.toLowerCase(),
        fileName: source?.fileName || null,
        lineNumber: source?.lineNumber || null,
        code: target.outerHTML,
        className: className,
        innerText: safeText.substring(0, 100)
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