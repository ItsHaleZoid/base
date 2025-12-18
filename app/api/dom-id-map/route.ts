import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * API route to serve the domId mapping
 * This allows the client-side Inspector to access the build-time mapping
 */
export async function GET() {
  try {
    // Only serve in development
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DOM_ID !== 'true') {
      return NextResponse.json({});
    }

    const mappingPath = join(process.cwd(), '.next', 'dom-id-map.json');
    
    try {
      const mappingContent = readFileSync(mappingPath, 'utf-8');
      const mapping = JSON.parse(mappingContent);
      return NextResponse.json(mapping);
    } catch (error) {
      // File doesn't exist yet or is invalid
      return NextResponse.json({});
    }
  } catch (error) {
    return NextResponse.json({}, { status: 500 });
  }
}