import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { fileURLToPath } from 'url';
import { runDiagnostics } from './diagnostics';

const connection = createConnection(ProposedFeatures.all);

connection.onInitialize((params: InitializeParams) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
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

connection.onDefinition(() => {
  return [];
});

connection.onHover(() => {
  return null;
});

connection.listen();
