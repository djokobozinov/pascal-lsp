import {
  Diagnostic,
  DiagnosticSeverity,
  Connection,
  TextDocumentIdentifier,
} from 'vscode-languageserver/node';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
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
 * Estimate token length from an FPC error message.
 * FPC often quotes the identifier: e.g. Identifier not found "foo"
 */
function tokenLengthFromMessage(message: string): number {
  const m = message.match(/"([^"]+)"/);
  return m ? m[1].length : 1;
}

/**
 * Parse FPC compiler output into diagnostics grouped by absolute file path.
 * Supports multi-file output (e.g. errors in unit files referenced by the compiled file).
 */
function parseAllDiagnostics(
  output: string,
  compiledFileDir: string
): Map<string, Diagnostic[]> {
  const byFile = new Map<string, Diagnostic[]>();
  let match: RegExpExecArray | null;
  FPC_ERROR_REGEX.lastIndex = 0;

  while ((match = FPC_ERROR_REGEX.exec(output)) !== null) {
    const [, file, lineStr, colStr, severity, message] = match;
    const fileTrimmed = file.trim();

    // Resolve to absolute path (FPC may output relative or absolute paths)
    const absPath = path.isAbsolute(fileTrimmed)
      ? fileTrimmed
      : path.resolve(compiledFileDir, fileTrimmed);

    const line = Math.max(0, parseInt(lineStr, 10) - 1); // 1-based → 0-based
    const col = colStr ? Math.max(0, parseInt(colStr, 10) - 1) : 0;

    // Extend highlight range to cover the full token (extracted from message)
    const tokenLen = tokenLengthFromMessage(message.trim());
    const endCol = colStr ? Math.max(col + tokenLen, col + 1) : 0;

    if (!byFile.has(absPath)) byFile.set(absPath, []);
    byFile.get(absPath)!.push({
      range: {
        start: { line, character: col },
        end: { line, character: endCol },
      },
      message: message.trim(),
      severity: parseSeverity(severity),
      source: 'fpc',
    });
  }

  return byFile;
}

/**
 * Track which URIs had diagnostics published as a result of each compilation.
 * Key: compiled file path; Value: set of affected URIs.
 * This enables clearing stale diagnostics when errors are fixed.
 */
const compilationAffectedUris = new Map<string, Set<string>>();

/**
 * Run diagnostics for a Pascal file and publish results to the client.
 * Publishes inline diagnostics for all files mentioned in the FPC output,
 * and clears diagnostics for files that are no longer affected.
 */
export async function runDiagnostics(
  connection: Connection,
  document: TextDocumentIdentifier,
  documentPath: string
): Promise<void> {
  const uri = document.uri;
  const compiledFileDir = path.dirname(documentPath);

  const result: CompileResult = await compile(documentPath);

  // Special case: FPC binary not found
  if (result.stderr.includes('Free Pascal compiler not found')) {
    compilationAffectedUris.set(documentPath, new Set([uri]));
    await connection.sendDiagnostics({
      uri,
      diagnostics: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          message: result.stderr,
          severity: DiagnosticSeverity.Warning,
          source: 'pascal-lsp',
        },
      ],
    });
    return;
  }

  // FPC writes errors/warnings to stdout; stderr is for system-level errors only
  const fpcOutput = (result.stdout + '\n' + result.stderr).trim();

  const previousAffected = compilationAffectedUris.get(documentPath) ?? new Set<string>();
  const currentAffected = new Set<string>();
  compilationAffectedUris.set(documentPath, currentAffected);

  // Parse diagnostics grouped by file
  const byFile = parseAllDiagnostics(fpcOutput, compiledFileDir);

  if (byFile.size === 0) {
    // No parseable diagnostics
    if (result.code !== 0 && fpcOutput) {
      // Compilation failed but output doesn't match the standard FPC format — show raw
      currentAffected.add(uri);
      await connection.sendDiagnostics({
        uri,
        diagnostics: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            message: fpcOutput.split('\n')[0],
            severity: DiagnosticSeverity.Error,
            source: 'fpc',
          },
        ],
      });
    } else {
      // Success — clear everything
      await connection.sendDiagnostics({ uri, diagnostics: [] });
    }
    for (const prevUri of previousAffected) {
      if (!currentAffected.has(prevUri)) {
        await connection.sendDiagnostics({ uri: prevUri, diagnostics: [] });
      }
    }
    return;
  }

  // Publish diagnostics for every file that has errors/warnings
  for (const [filePath, diagnostics] of byFile) {
    const fileUri = pathToFileURL(filePath).href;
    currentAffected.add(fileUri);
    await connection.sendDiagnostics({ uri: fileUri, diagnostics });
  }

  // Clear URIs that were previously affected but are now clean
  for (const prevUri of previousAffected) {
    if (!currentAffected.has(prevUri)) {
      await connection.sendDiagnostics({ uri: prevUri, diagnostics: [] });
    }
  }

  // Ensure the compiled file itself is cleared if it has no errors
  if (!currentAffected.has(uri)) {
    await connection.sendDiagnostics({ uri, diagnostics: [] });
  }
}
