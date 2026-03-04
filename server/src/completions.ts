import {
  CompletionItem,
  CompletionItemKind,
  Position,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const PASCAL_KEYWORDS = [
  'program', 'unit', 'interface', 'implementation', 'uses',
  'begin', 'end', 'procedure', 'function', 'var', 'const', 'type',
  'class', 'record', 'object', 'inherited', 'self',
  'if', 'then', 'else', 'for', 'to', 'downto', 'do', 'while',
  'repeat', 'until', 'case', 'of', 'with', 'in',
  'and', 'or', 'not', 'xor', 'div', 'mod', 'shl', 'shr',
  'true', 'false', 'nil',
  'array', 'string', 'integer', 'boolean', 'real', 'char',
  'byte', 'word', 'longint', 'cardinal', 'double', 'single',
  'extended', 'pointer', 'ansistring', 'widestring',
  'override', 'virtual', 'abstract', 'external', 'forward',
  'try', 'except', 'finally', 'raise', 'exit', 'result',
  'constructor', 'destructor', 'property',
  'published', 'public', 'protected', 'private',
  'writeln', 'write', 'readln', 'read', 'length', 'setlength',
  'copy', 'pos', 'upcase', 'lowercase', 'assigned', 'free', 'create',
  'inc', 'dec', 'ord', 'chr', 'succ', 'pred', 'odd',
  'high', 'low', 'sizeof',
];

interface VarInfo {
  name: string;
  typeName: string;
}

interface MemberInfo {
  name: string;
  isMethod: boolean;
}

interface TypeInfo {
  name: string;
  members: MemberInfo[];
  parentType?: string;
}

function trimComment(line: string): string {
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

function parseVarDeclarations(text: string): VarInfo[] {
  const vars: VarInfo[] = [];
  const lines = text.split(/\r?\n/);
  let inVarBlock = false;

  for (const line of lines) {
    const code = trimComment(line);
    if (!code) continue;

    if (/^\s*var\s*$/i.test(code)) {
      inVarBlock = true;
      continue;
    }
    if (/^\s*(procedure|function|type|const|begin|implementation|interface)\b/i.test(code)) {
      inVarBlock = false;
    }

    if (inVarBlock) {
      const m = code.match(/^\s*(\w+)(?:\s*,\s*\w+)*\s*:\s*(\w+)/);
      if (m) vars.push({ name: m[1], typeName: m[2] });
    }

    // Inline: var x: TType
    const inline = code.match(/\bvar\s+(\w+)\s*:\s*(\w+)/i);
    if (inline) vars.push({ name: inline[1], typeName: inline[2] });
  }

  return vars;
}

function parseTypeDefinitions(text: string): TypeInfo[] {
  const types: TypeInfo[] = [];
  const lines = text.split(/\r?\n/);
  let current: TypeInfo | null = null;
  let depth = 0;

  for (const line of lines) {
    const code = trimComment(line);
    if (!code) continue;

    if (!current) {
      const classMatch = code.match(/^\s*(\w+)\s*=\s*class(?:\s*\(\s*(\w+)\s*\))?/i);
      const recordMatch = code.match(/^\s*(\w+)\s*=\s*(?:record|object)\b/i);
      if (classMatch) {
        current = { name: classMatch[1], members: [], parentType: classMatch[2] };
        types.push(current);
        depth = 1;
      } else if (recordMatch) {
        current = { name: recordMatch[1], members: [] };
        types.push(current);
        depth = 1;
      }
    } else {
      if (/\bend\b/i.test(code)) {
        depth--;
        if (depth <= 0) { current = null; depth = 0; }
        continue;
      }
      if (/\brecord\b|\bclass\b/i.test(code)) depth++;

      // Skip visibility modifiers
      if (/^\s*(private|protected|public|published)\s*$/i.test(code)) continue;

      const proc = code.match(/^\s*(?:procedure|constructor|destructor)\s+(\w+)/i);
      const func = code.match(/^\s*function\s+(\w+)/i);
      const field = code.match(/^\s*(\w+)(?:\s*,\s*\w+)*\s*:\s*\w+/);

      if (proc) current.members.push({ name: proc[1], isMethod: true });
      else if (func) current.members.push({ name: func[1], isMethod: true });
      else if (field) current.members.push({ name: field[1], isMethod: false });
    }
  }

  return types;
}

function getSymbolsFromText(text: string): string[] {
  const symbols: string[] = [];
  const regexes = [
    /\bprocedure\s+(\w+)/gi,
    /\bfunction\s+(\w+)/gi,
    /\btype\s+(\w+)/gi,
    /\bconst\s+(\w+)/gi,
    /\bvar\s+(\w+)/gi,
    /\b(\w+)\s*=\s*class\b/gi,
  ];
  for (const rx of regexes) {
    for (const m of text.matchAll(rx)) {
      if (m[1]) symbols.push(m[1]);
    }
  }
  return [...new Set(symbols)];
}

function getUsedUnits(text: string): string[] {
  const units: string[] = [];
  for (const m of text.matchAll(/\buses\s+([\s\S]*?)\s*;/gi)) {
    for (const part of m[1].split(',')) {
      const id = part.trim().split(/\s+/)[0];
      if (id && /^[a-zA-Z_]\w*$/.test(id)) units.push(id);
    }
  }
  return units;
}

function resolveUnitPath(unitName: string, dirs: string[]): string | null {
  for (const dir of dirs) {
    for (const ext of ['.pas', '.pp']) {
      const p = path.join(dir, `${unitName}${ext}`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * Returns true if the cursor position is right after a dot (member access).
 * e.g. "myObj." or "myObj.par" → true
 */
function isAfterDot(text: string, position: Position): boolean {
  const lines = text.split(/\r?\n/);
  const line = lines[position.line] ?? '';
  const prefix = line.slice(0, position.character);
  return /\w+\.\w*$/.test(prefix);
}

/**
 * Extracts the identifier immediately before the dot.
 * e.g. "myObj.pa" → "myObj"
 */
function getObjectNameBeforeDot(text: string, position: Position): string | null {
  const lines = text.split(/\r?\n/);
  const line = lines[position.line] ?? '';
  const prefix = line.slice(0, position.character);
  const m = prefix.match(/(\w+)\.\w*$/);
  return m ? m[1] : null;
}

function getMembersForType(
  typeName: string,
  typeDefs: TypeInfo[],
  text: string,
  document: TextDocument,
  workspaceRoots: string[]
): CompletionItem[] {
  const items: CompletionItem[] = [];
  const visited = new Set<string>();

  function collectMembers(tName: string): void {
    if (visited.has(tName.toLowerCase())) return;
    visited.add(tName.toLowerCase());

    const typeInfo = typeDefs.find((t) => t.name.toLowerCase() === tName.toLowerCase());
    if (typeInfo) {
      for (const member of typeInfo.members) {
        items.push({
          label: member.name,
          kind: member.isMethod ? CompletionItemKind.Method : CompletionItemKind.Field,
        });
      }
      if (typeInfo.parentType) collectMembers(typeInfo.parentType);
      return;
    }

    // Search imported units
    let docDir: string;
    try { docDir = path.dirname(fileURLToPath(document.uri)); } catch { return; }
    const dirs = [docDir, ...workspaceRoots];

    for (const unitName of getUsedUnits(text)) {
      const unitPath = resolveUnitPath(unitName, dirs);
      if (!unitPath) continue;
      try {
        const unitText = fs.readFileSync(unitPath, 'utf-8');
        const unitTypes = parseTypeDefinitions(unitText);
        const ut = unitTypes.find((t) => t.name.toLowerCase() === tName.toLowerCase());
        if (ut) {
          for (const member of ut.members) {
            items.push({
              label: member.name,
              kind: member.isMethod ? CompletionItemKind.Method : CompletionItemKind.Field,
            });
          }
          if (ut.parentType) collectMembers(ut.parentType);
          return;
        }
      } catch { /* ignore */ }
    }
  }

  collectMembers(typeName);
  return items;
}

function getDotCompletions(
  text: string,
  position: Position,
  document: TextDocument,
  workspaceRoots: string[]
): CompletionItem[] {
  const objName = getObjectNameBeforeDot(text, position);
  if (!objName) return [];

  const varDecls = parseVarDeclarations(text);
  const typeDefs = parseTypeDefinitions(text);

  let typeName: string | undefined;

  if (/^self$/i.test(objName)) {
    // Find the enclosing class name
    const classMatch = text.match(/(\w+)\s*=\s*class\b/i);
    if (classMatch) typeName = classMatch[1];
  } else {
    const varInfo = varDecls.find((v) => v.name.toLowerCase() === objName.toLowerCase());
    if (varInfo) typeName = varInfo.typeName;
  }

  if (!typeName) return [];

  return getMembersForType(typeName, typeDefs, text, document, workspaceRoots);
}

function getGeneralCompletions(
  text: string,
  document: TextDocument,
  workspaceRoots: string[]
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Keywords
  for (const kw of PASCAL_KEYWORDS) {
    items.push({ label: kw, kind: CompletionItemKind.Keyword });
  }

  // Symbols from current document
  for (const sym of getSymbolsFromText(text)) {
    items.push({ label: sym, kind: CompletionItemKind.Variable });
  }

  // Symbols from imported units
  let docDir: string;
  try { docDir = path.dirname(fileURLToPath(document.uri)); } catch { return items; }
  const dirs = [docDir, ...workspaceRoots];

  for (const unitName of getUsedUnits(text)) {
    const unitPath = resolveUnitPath(unitName, dirs);
    if (!unitPath) continue;
    try {
      const unitText = fs.readFileSync(unitPath, 'utf-8');
      for (const sym of getSymbolsFromText(unitText)) {
        items.push({ label: sym, kind: CompletionItemKind.Reference });
      }
    } catch { /* ignore */ }
  }

  return items;
}

export function getCompletionItems(
  document: TextDocument,
  position: Position,
  workspaceRoots: string[]
): CompletionItem[] {
  const text = document.getText();

  if (isAfterDot(text, position)) {
    return getDotCompletions(text, position, document, workspaceRoots);
  }

  return getGeneralCompletions(text, document, workspaceRoots);
}
