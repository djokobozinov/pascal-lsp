# Pascal Language Support

A VS Code extension providing full language support for Pascal (`.pas`, `.pp`), powered by the Free Pascal Compiler and the Language Server Protocol.

## Features

### Code Lens — Run & Build
Click **▶ Run** or **⚙ Build** above any `program` declaration to compile and run your program without leaving the editor.

- **▶ Run** — compiles with FPC then launches the executable in the integrated terminal
- **⚙ Build** — compiles only; errors and warnings appear in the Pascal output channel

> You can also press **F5** to run or **Ctrl+Shift+B** to build the current file.

### Compile-time Diagnostics
On every save the file is compiled with FPC. Errors, warnings, hints, and notes appear inline as squiggly underlines and in the Problems panel — no manual build step required.

### Hover Information
Hover over any identifier (procedure, function, type, constant, variable, unit) to see its kind and the full declaration line in a tooltip.

### Go to Definition
Press **F12** or **Ctrl+Click** on any identifier to jump to where it is declared — across the current file and any units listed in the `uses` clause.
Works for: procedures, functions, types, constants, variables, classes, and units.

### Auto-completion
- **Keywords** — all Pascal keywords, types, and built-ins
- **Symbols** — procedures, functions, types, constants, variables from the current file
- **Cross-unit** — symbols from every unit in the `uses` clause
- **Member access** — trigger completions after a dot (`obj.`) to see fields and methods of the inferred type, including inherited members

### Document Outline
The breadcrumb bar and the Outline panel list all procedures, functions, types, constants, variables, classes, and units in the file, with correct VS Code icons.

### Syntax Highlighting
Full TextMate grammar covering keywords, types, comments (`{ }`, `(* *)`, `//`), strings, numbers (integer, float, hex `$1A2B`), and more.

### Language Configuration
Pascal-aware bracket matching, auto-closing pairs (`()`, `[]`, `{}`, `''`), block/line comment toggling, and word-pattern for identifiers.

---

## Requirements

- [VS Code](https://code.visualstudio.com/) 1.85.0 or newer
- [Free Pascal Compiler (FPC)](https://www.freepascal.org/) for diagnostics, building, and running

### Installing FPC

**Linux / macOS**
```bash
# Debian/Ubuntu
sudo apt install fpc

# macOS (Homebrew)
brew install fpc
```
Ensure `fpc` is in your `PATH`.

**Windows**
Download the installer from [freepascal.org/download.html](https://www.freepascal.org/download.html) and add the `bin\i386-win32\` directory to your system `PATH`, or install to the default `C:\FPC\<version>\` location (auto-detected by the extension).

---

## Installation

### From VSIX
1. Obtain a `.vsix` file (from a release or by building from source below)
2. In VS Code open the Command Palette (**Ctrl+Shift+P**)
3. Run **Extensions: Install from VSIX…**
4. Select the `.vsix` file and reload when prompted

### From source
```bash
git clone https://github.com/djokobozinov/pascal-lsp.git
cd pascal-lsp
npm install
npm run compile
```
Press **F5** in VS Code to launch an Extension Development Host with the extension active.

To package a `.vsix`:
```bash
npm run vscode:prepublish
npx vsce package
```

---

## Usage

Open any `.pas` or `.pp` file — the extension activates automatically.

| Action | How |
|--------|-----|
| Run program | **▶ Run** code lens · **F5** · Command Palette → *Pascal: Run Program* |
| Build (compile) | **⚙ Build** code lens · **Ctrl+Shift+B** · Command Palette → *Pascal: Build (Compile)* |
| Go to definition | **F12** or **Ctrl+Click** on identifier |
| Hover info | Hover mouse over any identifier |
| Auto-complete | **Ctrl+Space**, or type `.` after an object |
| Show output | Command Palette → *Pascal: Show Output* |
| Restart language server | Command Palette → *Pascal: Restart Language Server* |
| Set FPC path | Command Palette → *Pascal: Set FPC Path* |

---

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `pascal.fpcPath` | `""` | Full path to the `fpc` binary. Leave blank to auto-detect from `PATH`. |
| `pascal.compilerFlags` | `["-Mdelphi"]` | Extra flags passed to FPC (e.g. `["-Mdelphi", "-O2"]`). |
| `pascal.runInTerminal` | `true` | When `true`, runs the compiled program in the integrated terminal; when `false`, streams output to the Pascal output channel. |
| `pascal.showOutputOnBuild` | `true` | Automatically focus the Pascal output channel on build/run. |

---

## Project Structure

```
pascal-lsp/
├── client/
│   └── src/
│       └── extension.ts     # VS Code extension: code lens, commands, LSP client
├── server/
│   └── src/
│       ├── server.ts         # LSP server: capabilities, request routing
│       ├── fpc.ts            # FPC discovery and compilation
│       ├── diagnostics.ts    # FPC output parsing → VS Code diagnostics
│       ├── navigation.ts     # Go-to-definition, document symbols, hover
│       └── completions.ts    # Auto-completion (keywords, symbols, member access)
├── syntaxes/
│   └── pascal.tmLanguage.json
├── language-configuration.json
├── package.json
└── README.md
```

---

## Development

```bash
npm run compile   # one-shot build
npm run watch     # incremental rebuild on change
```

Press **F5** to launch the Extension Development Host.
The LSP server can be debugged on port `6009` (attach a Node.js debugger).

---

## License

MIT — see [LICENSE](LICENSE).
