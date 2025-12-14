"use client";
import { useEffect, useState } from "react";

/**
 * React 19 removed _debugSource from Fiber nodes.
 * This Inspector now uses multiple fallback strategies:
 * 1. Custom data-inspector-* attributes (requires Babel plugin)
 * 2. Stack trace parsing from error boundaries
 * 3. Component name + outerHTML as fallback
 */

// --- HELPER: Extract source from data attributes ---
function getSourceFromDataAttributes(element: HTMLElement) {
  let current: HTMLElement | null = element;
  
  while (current) {
    // Check for react-dev-inspector style attributes
    const relativePath = current.getAttribute('data-inspector-relative-path');
    const line = current.getAttribute('data-inspector-line');
    const column = current.getAttribute('data-inspector-column');
    
    if (relativePath && line) {
      return {
        fileName: relativePath,
        lineNumber: parseInt(line, 10),
        columnNumber: column ? parseInt(column, 10) : undefined
      };
    }
    
    // Check for other common debug attributes
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
      
      // Walk up the fiber tree to find a component
      let current = fiber;
      let depth = 0;
      
      while (current && depth < 20) {
        // Check for component type
        if (current.type) {
          if (typeof current.type === 'function') {
            return current.type.name || current.type.displayName || 'Anonymous';
          }
          if (typeof current.type === 'string') {
            return current.type;
          }
        }
        
        // Check _debugOwner for parent component
        if (current._debugOwner?.type) {
          const ownerType = current._debugOwner.type;
          if (typeof ownerType === 'function') {
            return ownerType.name || ownerType.displayName || 'Anonymous';
          }
        }
        
        current = current.return;
        depth++;
      }
    }
  } catch (err) {
    console.warn('Failed to get component name:', err);
  }
  
  return null;
}

// --- HELPER: Parse stack trace for source info ---
function getSourceFromStackTrace(): { fileName: string; lineNumber: number } | null {
  try {
    // Create an error to capture stack trace
    const error = new Error();
    const stack = error.stack;
    
    if (!stack) return null;
    
    const lines = stack.split('\n');
    
    // Look for the first line that's not from React internals
    for (const line of lines) {
      // Skip React internal files
      if (line.includes('node_modules/react') || 
          line.includes('react-dom') ||
          line.includes('Inspector')) {
        continue;
      }
      
      // Parse typical stack trace formats
      // Format: "at ComponentName (file.tsx:10:5)"
      const match = line.match(/at\s+.*?\s*\((.+?):(\d+):(\d+)\)/) ||
                   line.match(/(@|at\s+)(.+?):(\d+):(\d+)/);
      
      if (match) {
        const fileName = match[1] || match[2];
        const lineNumber = parseInt(match[2] || match[3], 10);
        
        if (fileName && !fileName.includes('node_modules')) {
          return { fileName, lineNumber };
        }
      }
    }
  } catch (err) {
    console.warn('Failed to parse stack trace:', err);
  }
  
  return null;
}

// --- MAIN: Robust React Source Finder for React 19+ ---
function getReactSource(element: HTMLElement) {
  console.group('🔍 Inspector: Searching for React source');
  
  // Strategy 1: Check for data attributes (most reliable for React 19)
  const dataAttrSource = getSourceFromDataAttributes(element);
  if (dataAttrSource) {
    console.log('✅ Found source from data attributes:', dataAttrSource);
    console.groupEnd();
    return dataAttrSource;
  }
  
  // Strategy 2: Try to get component name for better context
  const componentName = getComponentName(element);
  console.log('📦 Component name:', componentName || 'unknown');
  
  // Strategy 3: Get stack trace info as fallback
  const stackSource = getSourceFromStackTrace();
  if (stackSource) {
    console.log('✅ Found source from stack trace:', stackSource);
    console.groupEnd();
    return stackSource;
  }
  
  // Strategy 4: Check for legacy _debugSource (React 18 and earlier)
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
        
        // Check for legacy _debugSource
        let tempFiber = fiber;
        let depth = 0;
        
        while (tempFiber && depth < 30) {
          if (tempFiber._debugSource) {
            console.log('✅ Found legacy _debugSource (React 18):', tempFiber._debugSource);
            console.groupEnd();
            return tempFiber._debugSource;
          }
          
          if (tempFiber.memoizedProps?.__source) {
            console.log('✅ Found __source in props:', tempFiber.memoizedProps.__source);
            console.groupEnd();
            return tempFiber.memoizedProps.__source;
          }
          
          tempFiber = tempFiber.return;
          depth++;
        }
      }
      
      current = current.parentElement;
    }
  } catch (err) {
    console.warn('Error checking legacy sources:', err);
  }
  
  console.warn('⚠️ No source information found');
  console.log('💡 To enable source tracking in React 19, add @react-dev-inspector/babel-plugin');
  console.groupEnd();
  
  // Return component name if we found it
  return componentName ? { 
    fileName: `<${componentName}>`,
    lineNumber: null,
    columnNumber: null 
  } : null;
}

export function Inspector() {
  const [active, setActive] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);

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
      setHoveredElement(null);
      return;
    }

    const handleMouseOver = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (target === document.body || target === document.documentElement) return;

      setHoveredElement(target);
      target.style.outline = "2px dashed #3b82f6";
      target.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
      target.style.cursor = "crosshair";
      target.style.transition = "all 0.15s ease-in-out";
    };

    const handleMouseOut = (e: MouseEvent) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      setHoveredElement(null);
      target.style.outline = "";
      target.style.backgroundColor = "";
      target.style.cursor = "";
    };

    const handleClick = (e: MouseEvent) => {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;

      // Use the robust source finder
      const source = getReactSource(target);
      
      console.log("🎯 Final React Source:", source);
      console.log("🎯 Target Element:", target);

      // Safely extract class/text (handle SVGs/Images)
      let className = "";
      if (typeof target.className === 'string') {
        className = target.className;
      } else if (target.getAttribute) {
        className = target.getAttribute("class") || "";
      }

      const safeText = target.innerText || target.textContent || "";

      // Send to Parent
      window.parent.postMessage({
        type: 'ELEMENT_SELECTED',
        tagName: target.tagName.toLowerCase(),
        fileName: source?.fileName || null,
        lineNumber: source?.lineNumber || null,
        columnNumber: source?.columnNumber || null,
        code: target.outerHTML,
        className: className,
        innerText: safeText.substring(0, 100),
        // Additional context for debugging
        hasDataAttributes: !!getSourceFromDataAttributes(target),
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

  // Render tag label when hovering
  useEffect(() => {
    if (!hoveredElement || !active) return;

    const tagName = hoveredElement.tagName.toLowerCase();
    const rect = hoveredElement.getBoundingClientRect();

    // Create or update the label element
    let label = document.getElementById('inspector-tag-label');
    if (!label) {
      label = document.createElement('div');
      label.id = 'inspector-tag-label';
      document.body.appendChild(label);
    }

    // Style the label
    label.style.position = 'fixed';
    label.style.backgroundColor = '#3b82f6';
    label.style.color = 'white';
    label.style.padding = '2px 6px';
    label.style.fontSize = '12px';
    label.style.fontFamily = 'monospace';
    label.style.borderRadius = '2px';
    label.style.pointerEvents = 'none';
    label.style.zIndex = '999999';
    label.style.transition = 'all 0.15s ease-in-out';
    label.textContent = tagName;

    // Position at top-left of the element
    label.style.left = `${rect.left + window.scrollX}px`;
    label.style.top = `${rect.top + window.scrollY - 20}px`;

    return () => {
      const labelToRemove = document.getElementById('inspector-tag-label');
      if (labelToRemove) {
        labelToRemove.remove();
      }
    };
  }, [hoveredElement, active]);

  return null;
}