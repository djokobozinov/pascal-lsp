import * as path from 'path';
import * as fs from 'fs';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import {
  workspace,
  window,
  commands,
  languages,
  CodeLens,
  CodeLensProvider,
  TextDocument,
  Range,
  Position,
  OutputChannel,
  ExtensionContext,
} from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

const execFileAsync = promisify(execFile);

let client: LanguageClient | undefined;
let outputChannel: OutputChannel;

// ---------------------------------------------------------------------------
// FPC discovery
// ---------------------------------------------------------------------------

function findFpcPath(): string | null {
  const configPath = workspace.getConfiguration('pascal').get<string>('fpcPath');
  if (configPath && configPath.trim() && fs.existsSync(configPath.trim())) {
    return configPath.trim();
  }

  const binary = process.platform === 'win32' ? 'fpc.exe' : 'fpc';
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${whichCmd} ${binary}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const first = result.trim().split('\n')[0]?.trim();
    if (first) return first;
  } catch {
    // not in PATH
  }

  if (process.platform === 'win32') {
    const candidates = [
      'C:\\FPC\\3.2.2\\bin\\i386-win32\\fpc.exe',
      'C:\\FPC\\2.6.4\\bin\\i386-win32\\fpc.exe',
      path.join(
        process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
        'FPC',
        'bin',
        'fpc.exe'
      ),
      path.join(
        process.env['ProgramFiles'] ?? 'C:\\Program Files',
        'FPC',
        'bin',
        'fpc.exe'
      ),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Compilation helper
// ---------------------------------------------------------------------------

function getExecutablePath(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  return process.platform === 'win32'
    ? path.join(dir, `${base}.exe`)
    : path.join(dir, base);
}

async function buildFile(filePath: string): Promise<boolean> {
  const fpcPath = findFpcPath();
  if (!fpcPath) {
    outputChannel.appendLine(
      'ERROR: Free Pascal compiler (fpc) not found.\n' +
        'Install FPC (https://www.freepascal.org) and add it to PATH, or set "pascal.fpcPath" in settings.'
    );
    return false;
  }

  const extraFlags =
    workspace.getConfiguration('pascal').get<string[]>('compilerFlags') ?? ['-Mdelphi'];

  const args = [...extraFlags, filePath];
  outputChannel.appendLine(`\n$ ${fpcPath} ${args.join(' ')}`);

  try {
    const { stdout, stderr } = await execFileAsync(fpcPath, args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60_000,
    });
    const out = (stdout + stderr).trim();
    if (out) outputChannel.appendLine(out);
    outputChannel.appendLine('Build succeeded.');
    return true;
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    const out = ((e.stdout ?? '') + (e.stderr ?? '')).trim();
    if (out) outputChannel.appendLine(out);
    else outputChannel.appendLine(String(err));
    outputChannel.appendLine('Build failed.');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Code lens provider
// ---------------------------------------------------------------------------

class PascalCodeLensProvider implements CodeLensProvider {
  provideCodeLenses(document: TextDocument): CodeLens[] {
    const lenses: CodeLens[] = [];
    const lines = document.getText().split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart().toLowerCase();

      // Show Run + Build lenses above `program <name>;` declarations
      if (/^program\s+\w+/.test(trimmed)) {
        const range = new Range(new Position(i, 0), new Position(i, lines[i].length));
        lenses.push(
          new CodeLens(range, {
            title: '▶ Run',
            tooltip: 'Compile and run this program',
            command: 'pascal.runProgram',
            arguments: [document.uri.fsPath],
          })
        );
        lenses.push(
          new CodeLens(range, {
            title: '⚙ Build',
            tooltip: 'Compile without running',
            command: 'pascal.buildProgram',
            arguments: [document.uri.fsPath],
          })
        );
        break; // only one program declaration per file
      }
    }

    return lenses;
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function commandRunProgram(filePath?: string): Promise<void> {
  const fp = filePath ?? window.activeTextEditor?.document.uri.fsPath;
  if (!fp) {
    void window.showErrorMessage('Pascal: No active Pascal file to run.');
    return;
  }

  const showOnBuild = workspace
    .getConfiguration('pascal')
    .get<boolean>('showOutputOnBuild', true);
  if (showOnBuild) outputChannel.show(true);
  outputChannel.appendLine(`\n=== Run: ${path.basename(fp)} ===`);

  const ok = await buildFile(fp);
  if (!ok) {
    void window.showErrorMessage('Pascal: Build failed — see Pascal output for details.');
    return;
  }

  const exe = getExecutablePath(fp);
  if (!fs.existsSync(exe)) {
    outputChannel.appendLine(`ERROR: Executable not found at ${exe}`);
    void window.showErrorMessage(`Pascal: Executable not found: ${exe}`);
    return;
  }

  const runInTerminal = workspace
    .getConfiguration('pascal')
    .get<boolean>('runInTerminal', true);

  if (runInTerminal) {
    // Reuse or create a terminal named "Pascal"
    let terminal = window.terminals.find((t) => t.name === 'Pascal');
    if (!terminal || terminal.exitStatus !== undefined) {
      terminal = window.createTerminal({ name: 'Pascal', cwd: path.dirname(exe) });
    }
    terminal.show(true);
    // Quote paths with spaces
    const quotedExe = exe.includes(' ') ? `"${exe}"` : exe;
    terminal.sendText(quotedExe);
  } else {
    // Run and stream output to the output channel
    outputChannel.appendLine(`\n--- Program output ---`);
    const proc = execFile(exe, [], { cwd: path.dirname(exe) });
    proc.stdout?.on('data', (d: Buffer) => outputChannel.append(d.toString()));
    proc.stderr?.on('data', (d: Buffer) => outputChannel.append(d.toString()));
    proc.on('close', (code) => {
      outputChannel.appendLine(`\n--- Exited with code ${code ?? '?'} ---`);
    });
  }
}

async function commandBuildProgram(filePath?: string): Promise<void> {
  const fp = filePath ?? window.activeTextEditor?.document.uri.fsPath;
  if (!fp) {
    void window.showErrorMessage('Pascal: No active Pascal file to build.');
    return;
  }

  const showOnBuild = workspace
    .getConfiguration('pascal')
    .get<boolean>('showOutputOnBuild', true);
  if (showOnBuild) outputChannel.show(true);
  outputChannel.appendLine(`\n=== Build: ${path.basename(fp)} ===`);

  const ok = await buildFile(fp);
  if (ok) {
    void window.showInformationMessage('Pascal: Build succeeded.');
  } else {
    void window.showErrorMessage('Pascal: Build failed — see Pascal output for details.');
  }
}

async function commandRestartServer(): Promise<void> {
  if (!client) return;
  void window.showInformationMessage('Pascal: Restarting language server…');
  await client.stop();
  await client.start();
  void window.showInformationMessage('Pascal: Language server restarted.');
}

function commandShowOutput(): void {
  outputChannel.show();
}

async function commandSetFpcPath(): Promise<void> {
  const current = workspace.getConfiguration('pascal').get<string>('fpcPath') ?? '';
  const auto = findFpcPath();
  const placeholder = auto
    ? `Auto-detected: ${auto} (leave blank to use auto-detect)`
    : 'e.g. /usr/bin/fpc or C:\\FPC\\3.2.2\\bin\\i386-win32\\fpc.exe';

  const value = await window.showInputBox({
    title: 'Pascal: Set FPC Path',
    prompt: 'Enter the full path to the fpc binary, or leave blank to auto-detect.',
    value: current,
    placeHolder: placeholder,
  });

  if (value === undefined) return; // cancelled
  await workspace.getConfiguration('pascal').update('fpcPath', value.trim(), true);

  const resolved = findFpcPath();
  if (resolved) {
    void window.showInformationMessage(`Pascal: Using FPC at ${resolved}`);
  } else {
    void window.showWarningMessage(
      'Pascal: FPC not found. Install FPC and add to PATH, or set the path above.'
    );
  }
}

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

export function activate(context: ExtensionContext): void {
  outputChannel = window.createOutputChannel('Pascal');

  // Start LSP server
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

  client = new LanguageClient(
    'pascalLsp',
    'Pascal Language Server',
    serverOptions,
    clientOptions
  );
  client.start();

  // Code lens
  context.subscriptions.push(
    languages.registerCodeLensProvider({ language: 'pascal' }, new PascalCodeLensProvider())
  );

  // Commands
  context.subscriptions.push(
    commands.registerCommand('pascal.runProgram', commandRunProgram),
    commands.registerCommand('pascal.buildProgram', commandBuildProgram),
    commands.registerCommand('pascal.restartServer', commandRestartServer),
    commands.registerCommand('pascal.showOutput', commandShowOutput),
    commands.registerCommand('pascal.setFpcPath', commandSetFpcPath)
  );

  outputChannel.appendLine('Pascal Language Support activated.');
}

export function deactivate(): Promise<void> | undefined {
  return client?.stop();
}
