// components/Inspector.tsx
"use client"; // <--- Critical for Next.js

import { useEffect, useState } from "react";

export function Inspector() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    // 1. Listen for the "Toggle" command from the Parent (Lithio)
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

    // 2. Define Mouse Handlers
    const handleMouseOver = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      
      // Ignore the root tags to avoid selecting the whole page
      if (target === document.body || target === document.documentElement) return;

      target.style.outline = "2px solid #3b82f6"; // Tailwind Blue-500
      target.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
      target.style.cursor = "default";
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
      
      // 3. Send the Selection back to Parent
      window.parent.postMessage({
        type: 'ELEMENT_SELECTED',
        tagName: target.tagName.toLowerCase(),
        className: target.className,
        innerText: target.innerText.substring(0, 50)
      }, '*');
    };

    // 3. Attach Listeners
    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [active]);

  return null; // It renders nothing visibly
}