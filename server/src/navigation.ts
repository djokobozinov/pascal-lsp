import {
  DocumentSymbol,
  SymbolKind,
  Location,
  Range,
  Position,
  TextDocument,
} from 'vscode-languageserver';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { trimComment, getUsedUnits, resolveUnitPath } from './utils';

export interface PascalSymbol {
  name: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: PascalSymbol[];
}

const PROC_REGEX = /\bprocedure\s+(\w+)/i;
const FUNC_REGEX = /\bfunction\s+(\w+)/i;
const TYPE_REGEX = /\btype\s+(\w+)\s*=/i;
const CONST_REGEX = /\bconst\s+(\w+)\b/i;
const VAR_REGEX = /\bvar\s+(\w+)\s*:/i;
const UNIT_REGEX = /\bunit\s+(\w+)\s*;/i;
const CLASS_REGEX = /\b(\w+)\s*=\s*class\b/i;

const PASCAL_KEYWORDS =
  /^(procedure|function|type|const|var|unit|begin|end|if|then|else|for|while|repeat|until|and|or|not|div|mod|asm|inherited|override|virtual|abstract|external|forward|uses|interface|implementation)$/i;

/**
 * Extract the full identifier at the given position (expands to word boundaries).
 * Handles Ctrl+click when cursor is in the middle of the word.
 */
function getIdentifierAtPosition(text: string, position: Position): string | null {
  const lines = text.split(/\r?\n/);
  const line = lines[position.line] ?? '';
  if (position.character < 0 || position.character > line.length) return null;

  const char = line[position.character];
  if (!char || !/[\w]/.test(char)) return null;

  let start = position.character;
  while (start > 0 && /[\w]/.test(line[start - 1])) start--;
  let end = position.character;
  while (end < line.length && /[\w]/.test(line[end])) end++;

  const identifier = line.slice(start, end);
  return identifier.length > 0 ? identifier : null;
}

function getSymbols(text: string): PascalSymbol[] {
  const symbols: PascalSymbol[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const codePart = trimComment(line);
    if (!codePart) continue;

    let match: RegExpMatchArray | null = null;
    let kind: SymbolKind = SymbolKind.Variable;

    if ((match = codePart.match(UNIT_REGEX))) {
      kind = SymbolKind.Module;
    } else if ((match = codePart.match(PROC_REGEX))) {
      kind = SymbolKind.Method;
    } else if ((match = codePart.match(FUNC_REGEX))) {
      kind = SymbolKind.Function;
    } else if ((match = codePart.match(TYPE_REGEX))) {
      kind = SymbolKind.Class;
    } else if ((match = codePart.match(CLASS_REGEX)) && symbols.some((s) => s.kind === SymbolKind.Class)) {
      kind = SymbolKind.Class;
    } else if ((match = codePart.match(CONST_REGEX))) {
      kind = SymbolKind.Constant;
    } else if ((match = codePart.match(VAR_REGEX))) {
      kind = SymbolKind.Variable;
    }

    if (match && match.index !== undefined && match[1]) {
      const name = match[1];
      const nameOffset = match[0].indexOf(name);
      const startChar = match.index + (nameOffset >= 0 ? nameOffset : 0);

      symbols.push({
        name,
        kind,
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length },
        },
        selectionRange: {
          start: { line: i, character: startChar },
          end: { line: i, character: startChar + name.length },
        },
      });
    }
  }

  return symbols;
}

function findSymbolInFile(filePath: string, identifier: string): Location | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const unitUri = pathToFileURL(filePath).href;
    const symbols = getSymbols(content);
    for (const sym of symbols) {
      if (sym.name.toLowerCase() === identifier.toLowerCase()) {
        return { uri: unitUri, range: sym.selectionRange };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function findUnitDeclarationInFile(filePath: string, unitName: string): Location | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const escaped = unitName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const unitRegex = new RegExp(`\\bunit\\s+(${escaped})\\s*;`, 'i');

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(unitRegex);
      if (m) {
        const charStart = lines[i].indexOf(m[1]);
        return {
          uri: pathToFileURL(filePath).href,
          range: {
            start: { line: i, character: charStart },
            end: { line: i, character: charStart + unitName.length },
          },
        };
      }
    }
    return {
      uri: pathToFileURL(filePath).href,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

function kindLabel(kind: SymbolKind): string {
  switch (kind) {
    case SymbolKind.Function: return 'function';
    case SymbolKind.Method:   return 'procedure';
    case SymbolKind.Class:    return 'type / class';
    case SymbolKind.Constant: return 'constant';
    case SymbolKind.Variable: return 'variable';
    case SymbolKind.Module:   return 'unit';
    default:                  return 'symbol';
  }
}

/**
 * Return markdown hover content for the identifier at `position`, or null if
 * there is nothing useful to show.
 */
export function getHoverInfo(document: TextDocument, position: Position): string | null {
  const text = document.getText();
  const identifier = getIdentifierAtPosition(text, position);
  if (!identifier) return null;
  if (PASCAL_KEYWORDS.test(identifier)) return null;

  const lines = text.split(/\r?\n/);
  const symbols = getSymbols(text);

  for (const sym of symbols) {
    if (sym.name.toLowerCase() !== identifier.toLowerCase()) continue;
    const raw = lines[sym.range.start.line] ?? '';
    const code = trimComment(raw).trim();
    return `**${sym.name}** *(${kindLabel(sym.kind)})*\n\`\`\`pascal\n${code}\n\`\`\``;
  }

  return null;
}

export function getDocumentSymbols(document: TextDocument): DocumentSymbol[] {
  const symbols = getSymbols(document.getText());
  return symbols.map((s) => ({
    name: s.name,
    kind: s.kind,
    range: s.range,
    selectionRange: s.selectionRange,
    children: s.children,
  }));
}

/**
 * Find definition for the identifier at the given position.
 * @param searchDirs Optional extra directories to search for units (e.g. workspace roots).
 */
export function findDefinition(
  document: TextDocument,
  position: Position,
  searchDirs?: string[]
): Location | null {
  const text = document.getText();
  const identifier = getIdentifierAtPosition(text, position);
  if (!identifier) return null;
  if (PASCAL_KEYWORDS.test(identifier)) return null;

  // Case-insensitive match — Pascal identifiers are case-insensitive
  const symbols = getSymbols(text);
  for (const sym of symbols) {
    if (sym.name.toLowerCase() === identifier.toLowerCase()) {
      return { uri: document.uri, range: sym.selectionRange };
    }
  }

  let docDir: string;
  try {
    docDir = path.dirname(fileURLToPath(document.uri));
  } catch {
    return null;
  }

  const dirs = [docDir, ...(searchDirs ?? [])];

  for (const unitName of getUsedUnits(text)) {
    const unitPath = resolveUnitPath(unitName, dirs);
    if (unitPath) {
      const loc = findSymbolInFile(unitPath, identifier);
      if (loc) return loc;
    }
  }

  const unitPath = resolveUnitPath(identifier, dirs);
  if (unitPath) {
    return findUnitDeclarationInFile(unitPath, identifier);
  }

  return null;
}
