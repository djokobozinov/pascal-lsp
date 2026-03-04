import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  TextDocuments,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath } from 'url';
import { runDiagnostics } from './diagnostics';
import { getDocumentSymbols, findDefinition } from './navigation';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
let workspaceRoots: string[] = [];

connection.onInitialize((params: InitializeParams) => {
  workspaceRoots =
    params.workspaceFolders?.map((wf) => fileURLToPath(wf.uri)) ?? [];
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      documentSymbolProvider: true,
      hoverProvider: true,
    },
  };
});

connection.onInitialized(() => {
  connection.console.log('Pascal language server initialized');
});

connection.onDidSaveTextDocument(async (params) => {
  const uri = params.textDocument.uri;
  const docPath = fileURLToPath(uri);

  if (!docPath.match(/\.(pas|pp)$/i)) {
    return;
  }

  connection.console.log(`Save received for: ${uri}`);

  try {
    await runDiagnostics(connection, { uri }, docPath);
  } catch (err) {
    connection.console.error(`Diagnostics failed: ${err}`);
    connection.sendDiagnostics({
      uri,
      diagnostics: [
        {
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          message: err instanceof Error ? err.message : String(err),
          severity: DiagnosticSeverity.Warning,
          source: 'pascal-lsp',
        },
      ],
    });
  }
});

connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;
  const loc = findDefinition(document, params.position, workspaceRoots);
  return loc ? [loc] : null;
});

connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  return getDocumentSymbols(document);
});

connection.onHover(() => {
  return null;
});

documents.listen(connection);
connection.listen();
