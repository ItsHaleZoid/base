/**
 * Babel plugin to inject data-dom-id attributes to all JSX elements
 * This helps map DOM elements back to their React source code
 */

const path = require('path');
const fs = require('fs');

// Global counter for unique IDs
let idCounter = 0;
const domIdMap = {};
const currentFileSource = {}; // Store current file source code by filename

// Ensure the .next directory exists
const ensureNextDir = () => {
  const nextDir = path.join(process.cwd(), '.next');
  if (!fs.existsSync(nextDir)) {
    fs.mkdirSync(nextDir, { recursive: true });
  }
};

// Load existing mapping to merge with new entries
const loadExistingMapping = () => {
  const mappingPath = path.join(process.cwd(), '.next', 'dom-id-map.json');
  if (fs.existsSync(mappingPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
      Object.assign(domIdMap, existing);
    } catch (e) {
      // If file is corrupted, start fresh
    }
  }
};

// Save the mapping to a JSON file (merge with existing)
const saveMapping = () => {
  ensureNextDir();
  const mappingPath = path.join(process.cwd(), '.next', 'dom-id-map.json');
  
  // Load existing to merge
  loadExistingMapping();
  
  // Save merged mapping
  fs.writeFileSync(mappingPath, JSON.stringify(domIdMap, null, 2));
};

// Initialize: load existing mapping
loadExistingMapping();

// Extract JSX code for an element from source
function extractJSXCode(sourceCode, startLoc, endLoc) {
  if (!startLoc || !endLoc || !sourceCode) {
    return null;
  }
  
  // Convert line/column to character index
  const lines = sourceCode.split('\n');
  let startIndex = 0;
  let endIndex = 0;
  
  // Calculate start index
  for (let i = 0; i < startLoc.line - 1; i++) {
    startIndex += lines[i].length + 1; // +1 for newline
  }
  startIndex += startLoc.column;
  
  // Calculate end index
  for (let i = 0; i < endLoc.line - 1; i++) {
    endIndex += lines[i].length + 1; // +1 for newline
  }
  endIndex += endLoc.column;
  
  // Extract the JSX code
  const jsxCode = sourceCode.substring(startIndex, endIndex).trim();
  return jsxCode || null;
}

// Generate a unique domId based on file path and line number
function generateDomId(state, node, jsxElementPath) {
  const filename = state.file.opts.filename || 'unknown';
  const relativePath = path.relative(process.cwd(), filename).replace(/\\/g, '/');
  const loc = node.loc;
  
  if (!loc) {
    return `dom-${++idCounter}`;
  }
  
  const line = loc.start.line;
  const column = loc.start.column;
  
  // Create a deterministic ID based on file path, line, and column
  const baseId = `${relativePath}:${line}:${column}`.replace(/[^a-zA-Z0-9:._-]/g, '_');
  const domId = `dom-${baseId}-${++idCounter}`;
  
  // Extract JSX code for this element
  let jsxCode = null;
  if (jsxElementPath && currentFileSource[filename]) {
    const sourceCode = currentFileSource[filename];
    const startLoc = jsxElementPath.node.loc?.start;
    const endLoc = jsxElementPath.node.loc?.end;
    
    if (startLoc && endLoc) {
      jsxCode = extractJSXCode(sourceCode, startLoc, endLoc);
    }
  }
  
  // Store mapping
  domIdMap[domId] = {
    fileName: relativePath,
    jsxCode: jsxCode, // Store the actual JSX code
  };
  
  return domId;
}

module.exports = function ({ types: t }) {
  return {
    visitor: {
      JSXOpeningElement(path, state) {
        // Skip if already has data-dom-id
        const hasDomId = path.node.attributes.some(
          attr => attr.name && attr.name.name === 'data-dom-id'
        );
        
        if (hasDomId) {
          return;
        }
        
        // Skip certain elements (like script, style, etc.)
        const elementName = path.node.name?.name || 
                           path.node.name?.object?.name ||
                           (path.node.name?.type === 'JSXMemberExpression' 
                             ? path.node.name.object?.name + '.' + path.node.name.property?.name
                             : null);
        
        if (elementName && ['script', 'style', 'meta', 'link', 'title', 'head', 'html'].includes(elementName)) {
          return;
        }
        
        // Skip if element name is not available (shouldn't happen, but safety check)
        if (!path.node.name) {
          return;
        }
        
        // Check if parent is a JSXElement (full element) or if it's self-closing
        const parent = path.parent;
        let jsxElementPath = null;
        
        if (parent && parent.type === 'JSXElement') {
          // Full element with opening and closing tags - use parent for full JSX code
          jsxElementPath = path.parentPath;
        } else {
          // Self-closing element - use the opening element itself
          jsxElementPath = path;
        }
        
        // Generate domId with the JSX element path for code extraction
        const domId = generateDomId(state, path.node, jsxElementPath);
        
        // Create the data-dom-id attribute
        const domIdAttr = t.jsxAttribute(
          t.jsxIdentifier('data-dom-id'),
          t.stringLiteral(domId)
        );
        
        // Add the attribute to the opening element
        path.node.attributes.push(domIdAttr);
      },
      
      Program: {
        enter(path, state) {
          // Load existing mapping when starting a file
          loadExistingMapping();
          
          // Read and store the source file content for JSX extraction
          const filename = state.file.opts.filename || 'unknown';
          if (filename !== 'unknown') {
            try {
              if (fs.existsSync(filename)) {
                const sourceCode = fs.readFileSync(filename, 'utf-8');
                currentFileSource[filename] = sourceCode;
              }
            } catch (e) {
              // Silently fail if we can't read the file
            }
          }
        },
        exit(path, state) {
          // Save mapping when we finish processing a file
          saveMapping();
          
          // Clean up source code for this file
          const filename = state.file.opts.filename || 'unknown';
          if (filename !== 'unknown') {
            delete currentFileSource[filename];
          }
        }
      }
    }
  };
};