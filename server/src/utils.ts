import * as path from 'path';
import * as fs from 'fs';

/**
 * Strip inline comments and block comments from a single line of Pascal code.
 * Handles `{ }`, `(* *)`, and `//` comment styles.
 */
export function trimComment(line: string): string {
  let result = line;
  const block1 = result.indexOf('{');
  if (block1 >= 0) {
    const block1End = result.indexOf('}', block1);
    if (block1End >= 0) result = result.slice(0, block1) + result.slice(block1End + 1);
    else result = result.slice(0, block1);
  }
  const block2 = result.indexOf('(*');
  if (block2 >= 0) {
    const block2End = result.indexOf('*)', block2);
    if (block2End >= 0) result = result.slice(0, block2) + result.slice(block2End + 2);
    else result = result.slice(0, block2);
  }
  const lineComment = result.indexOf('//');
  if (lineComment >= 0) result = result.slice(0, lineComment);
  return result.trim();
}

/**
 * Extract all unit names from `uses` clauses in Pascal source text.
 */
export function getUsedUnits(text: string): string[] {
  const units: string[] = [];
  const usesMatches = text.matchAll(/\buses\s+([\s\S]*?)\s*;/gi);
  for (const m of usesMatches) {
    const inner = m[1].trim();
    for (const part of inner.split(',')) {
      const ident = part.trim().split(/\s+/)[0];
      if (ident && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) {
        units.push(ident);
      }
    }
  }
  return units;
}

/**
 * Find the file path for a Pascal unit by searching directories for `.pas` / `.pp`.
 */
export function resolveUnitPath(unitName: string, searchDirs: string[]): string | null {
  for (const dir of searchDirs) {
    for (const ext of ['.pas', '.pp']) {
      const p = path.join(dir, `${unitName}${ext}`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
