import {
  Diagnostic,
  DiagnosticSeverity,
  Connection,
  TextDocumentIdentifier,
} from 'vscode-languageserver/node';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { compile, CompileResult } from './fpc';

/**
 * FPC error line format: file(line,col): Severity: message
 * Or: file(line): Severity: message  (column optional)
 */
const FPC_ERROR_REGEX = /([^(]+)\((\d+),?\s*(\d+)?\):\s*(Error|Warning|Fatal|Note|Hint):\s*(.+)/gm;

function parseSeverity(severity: string): DiagnosticSeverity {
  switch (severity) {
    case 'Error':
    case 'Fatal':
      return DiagnosticSeverity.Error;
    case 'Warning':
      return DiagnosticSeverity.Warning;
    case 'Note':
    case 'Hint':
      return DiagnosticSeverity.Information;
    default:
      return DiagnosticSeverity.Error;
  }
}

/**
 * Parse FPC compiler stderr output into VSCode diagnostics.
 */
export function parseDiagnostics(stderr: string, documentUri: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  let documentFileName: string;
  try {
    documentFileName = path.basename(fileURLToPath(documentUri));
  } catch {
    documentFileName = path.basename(documentUri.replace(/^file:\/\/\//, '/').replace(/^file:\/\//, ''));
  }

  let match: RegExpExecArray | null;
  FPC_ERROR_REGEX.lastIndex = 0;
  while ((match = FPC_ERROR_REGEX.exec(stderr)) !== null) {
    const [, file, lineStr, colStr, severity, message] = match;
    const reportedFile = path.basename(file.trim()).toLowerCase();
    // Only include diagnostics for the current document
    if (reportedFile !== documentFileName.toLowerCase()) {
      continue;
    }
    const line = Math.max(0, parseInt(lineStr, 10) - 1); // 1-based -> 0-based
    const col = colStr ? Math.max(0, parseInt(colStr, 10) - 1) : 0;
    const endCol = colStr ? col + 1 : 0;

    diagnostics.push({
      range: {
        start: { line, character: col },
        end: { line, character: endCol },
      },
      message: message.trim(),
      severity: parseSeverity(severity),
      source: 'fpc',
    });
  }

  return diagnostics;
}

/**
 * Run diagnostics for a Pascal file and publish results to the client.
 */
export async function runDiagnostics(
  connection: Connection,
  document: TextDocumentIdentifier,
  documentPath: string
): Promise<void> {
  const uri = document.uri;

  const result: CompileResult = await compile(documentPath);

  let diagnostics: Diagnostic[];

  if (!result.stderr && result.code === 0) {
    diagnostics = [];
  } else if (result.stderr.includes('Free Pascal compiler not found')) {
    diagnostics = [
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: result.stderr,
        severity: DiagnosticSeverity.Warning,
        source: 'pascal-lsp',
      },
    ];
  } else {
    diagnostics = parseDiagnostics(result.stderr, uri);
    // Fallback: if no parsed diagnostics but we have stderr, show raw output
    if (diagnostics.length === 0 && result.stderr.trim()) {
      diagnostics = [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          message: result.stderr.trim().split('\n')[0] || result.stderr.trim(),
          severity: DiagnosticSeverity.Error,
          source: 'fpc',
        },
      ];
    }
  }

  await connection.sendDiagnostics({ uri, diagnostics });
}
