"use client";
import { useEffect, useState } from "react";

// --- HELPER: Robust React Source Finder ---
function getReactSource(element: HTMLElement) {
  let currentElement: HTMLElement | null = element;

  // 1. Walk up the DOM tree until we find a node tracked by React
  while (currentElement) {
    const keys = Object.keys(currentElement);
    const fiberKey = keys.find((k) => k.startsWith("__reactFiber$"));
    const internalKey = keys.find((k) => k.startsWith("__reactInternalInstance$"));

    if (fiberKey) {
      // @ts-ignore
      let fiber = currentElement[fiberKey];
      const originalFiber = fiber;

      // 2. Once we have a Fiber, walk up the React Tree using multiple traversal methods to find the source file
      // (This skips internal divs to find the actual Component)

      // Way 1: Traverse using 'return' (parent in the fiber tree)
      let tempFiber = fiber;
      while (tempFiber) {
        if (tempFiber._debugSource) {
          return tempFiber._debugSource; // Found it! { fileName, lineNumber }
        }
        if (tempFiber.alternate?._debugSource) {
          return tempFiber.alternate._debugSource;
        }
        if (tempFiber.memoizedProps?.__source) {
          return tempFiber.memoizedProps.__source;
        }
        if (tempFiber.alternate?.memoizedProps?.__source) {
          return tempFiber.alternate.memoizedProps.__source;
        }
        tempFiber = tempFiber.return;
      }

      // Way 2: Traverse using '_debugOwner' (owner component that created this fiber)
      tempFiber = originalFiber;
      while (tempFiber) {
        if (tempFiber._debugSource) {
          return tempFiber._debugSource; // Found it! { fileName, lineNumber }
        }
        if (tempFiber.alternate?._debugSource) {
          return tempFiber.alternate._debugSource;
        }
        if (tempFiber.memoizedProps?.__source) {
          return tempFiber.memoizedProps.__source;
        }
        if (tempFiber.alternate?.memoizedProps?.__source) {
          return tempFiber.alternate.memoizedProps.__source;
        }
        tempFiber = tempFiber._debugOwner;
      }
    } else if (internalKey) {
      // Fallback for older React versions (pre-Fiber architecture)
      // @ts-ignore
      let internal = currentElement[internalKey];

      // Traverse using '_owner' in the internal instance tree
      while (internal) {
        if (internal._currentElement?._source) {
          return internal._currentElement._source; // Found it! { fileName, lineNumber }
        }
        internal = internal._currentElement?._owner;
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