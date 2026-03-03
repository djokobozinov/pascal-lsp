import * as path from 'path';
import { workspace } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export function activate(): void {
  const serverModule = path.join(__dirname, '..', '..', 'server', 'out', 'server.js');

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'pascal' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.{pas,pp}'),
    },
  };

  client = new LanguageClient('pascalLsp', 'Pascal Language Server', serverOptions, clientOptions);
  client.start();
}

export function deactivate(): Promise<void> {
  if (client) {
    return client.stop();
  }
  return Promise.resolve();
}
