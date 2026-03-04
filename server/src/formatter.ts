import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextEdit, Range, FormattingOptions } from 'vscode-languageserver/node';

export function formatDocument(document: TextDocument, options: FormattingOptions): TextEdit[] {
  const text = document.getText();
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const indentStr = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
  const result: string[] = [];
  let level = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      result.push('');
      continue;
    }

    const codeOnly = stripStringsAndComments(trimmed).toLowerCase();

    const dedentBefore = shouldDedentBefore(codeOnly);
    if (dedentBefore) {
      level = Math.max(0, level - 1);
    }

    result.push(indentStr.repeat(level) + trimmed);

    level = Math.max(0, level + getIndentDeltaAfter(codeOnly, dedentBefore));
  }

  const formatted = result.join(eol);
  if (formatted === text) return [];

  const start = { line: 0, character: 0 };
  const end = document.positionAt(text.length);
  return [TextEdit.replace(Range.create(start, end), formatted)];
}

/**
 * Strip string literals and comments from a line to get pure code tokens.
 * This prevents keywords inside strings/comments from affecting indentation.
 */
function stripStringsAndComments(line: string): string {
  let result = '';
  let i = 0;

  while (i < line.length) {
    if (line[i] === "'") {
      // Single-quoted Pascal string
      i++;
      while (i < line.length && line[i] !== "'") i++;
      i++; // closing quote
      result += ' ';
    } else if (line[i] === '/' && line[i + 1] === '/') {
      // Line comment - stop here
      break;
    } else if (line[i] === '{') {
      // Brace comment
      while (i < line.length && line[i] !== '}') i++;
      i++;
      result += ' ';
    } else if (line[i] === '(' && line[i + 1] === '*') {
      // (* ... *) comment
      i += 2;
      while (i < line.length - 1 && !(line[i] === '*' && line[i + 1] === ')')) i++;
      i += 2;
      result += ' ';
    } else {
      result += line[i];
      i++;
    }
  }

  return result;
}

function shouldDedentBefore(codeOnly: string): boolean {
  // end, until, except, finally should pull the indent back before the line
  return /^(end|until|except|finally)\b/.test(codeOnly);
}

function getIndentDeltaAfter(codeOnly: string, dedentedBefore: boolean): number {
  // begin (standalone or at end of line): indent after
  if (/\bbegin$/.test(codeOnly) || /^begin$/.test(codeOnly)) return 1;

  // try block start
  if (/^try$/.test(codeOnly)) return 1;

  // repeat..until loop
  if (/^repeat$/.test(codeOnly)) return 1;

  // record definition
  if (/\brecord$/.test(codeOnly)) return 1;

  // case X of
  if (/\bof$/.test(codeOnly)) return 1;

  // except/finally: already dedented before, now re-indent for the block body
  if (dedentedBefore && /^(except|finally)\b/.test(codeOnly)) return 1;

  return 0;
}
