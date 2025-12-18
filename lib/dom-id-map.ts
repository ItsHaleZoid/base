/**
 * Utility to load and access the domId mapping
 * This mapping connects DOM elements (via data-dom-id) to their source code locations
 */

export interface DomIdMapping {
  fileName: string;
  jsxCode?: string; // The actual React/JSX code for this element
}

let domIdMap: Record<string, DomIdMapping> | null = null;
let loadingPromise: Promise<void> | null = null;
let isLoading = false;

/**
 * Load the domId mapping from the generated JSON file
 * This is called lazily to avoid loading in production if not needed
 */
export function loadDomIdMap(): Record<string, DomIdMapping> {
  // Return cached map if available
  if (domIdMap !== null) {
    return domIdMap;
  }

  // Return empty map if on server-side
  if (typeof window === 'undefined') {
    return {};
  }

  // Initialize with empty map
  if (domIdMap === null) {
    domIdMap = {};
  }

  return domIdMap;
}

/**
 * Get source code information for a given domId
 * This will check the cached map (which should be preloaded)
 */
export function getSourceFromDomId(domId: string): DomIdMapping | null {
  const map = loadDomIdMap();
  return map[domId] || null;
}

/**
 * Async version that waits for loading to complete before returning
 * Use this to avoid race conditions when map might still be loading
 */
export async function getSourceFromDomIdAsync(domId: string): Promise<DomIdMapping | null> {
  // Wait for any in-progress loading to complete
  if (isLoading && loadingPromise) {
    await loadingPromise;
  }

  // If map is still empty, try loading it
  if (!domIdMap || Object.keys(domIdMap).length === 0) {
    await preloadDomIdMap();
  }

  const map = loadDomIdMap();
  return map[domId] || null;
}

/**
 * Preload the mapping (useful for eager loading)
 */
export async function preloadDomIdMap(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (isLoading) return loadingPromise || undefined;

  isLoading = true;
  loadingPromise = (async () => {
    try {
      const response = await fetch('/api/dom-id-map');
      if (response.ok) {
        domIdMap = await response.json();
      }
    } catch (error) {
      // Silently fail
    } finally {
      isLoading = false;
    }
  })();

  return loadingPromise;
}

/**
 * Force refresh the mapping (clears cache and re-fetches)
 * Call this after HMR updates to get the latest mappings
 */
export async function refreshDomIdMap(): Promise<void> {
  if (typeof window === 'undefined') return;

  // Don't clear cache until we have new data (prevents race condition)
  try {
    // Add cache-busting param to avoid browser caching
    const response = await fetch(`/api/dom-id-map?t=${Date.now()}`);
    if (response.ok) {
      const newMap = await response.json();
      // Only update after we have the new data
      domIdMap = newMap;
    }
  } catch (error) {
    // Silently fail - keep existing cache
  }
}
