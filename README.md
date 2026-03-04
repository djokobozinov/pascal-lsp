# Pascal Language Support

A VS Code extension providing language support for Pascal, including syntax highlighting and real-time diagnostics via the Free Pascal Compiler (FPC).

## Features

- **Syntax highlighting** — Full TextMate grammar for `.pas` and `.pp` files
- **Compile-time diagnostics** — Errors, warnings, hints, and notes from FPC displayed inline on save
- **Go to definition** — Ctrl+click (or F12) on identifiers to jump to their definition: procedures, functions, types, constants, variables, and units; supports cross-file navigation into `uses` units
- **Document outline** — Breadcrumb and symbol list for procedures, functions, types, constants, variables, units, and classes
- **Language configuration** — Block comments (`{ }`), line comments (`//`), brackets, auto-closing pairs, and word patterns for Pascal identifiers
- **LSP support** — Language Server Protocol for diagnostics, navigation, and extensibility

## Requirements

- [VS Code](https://code.visualstudio.com/) 1.85.0 or newer
- [Free Pascal Compiler (FPC)](https://www.freepascal.org/) — used for diagnostics (syntax checking on save)

### Installing Free Pascal

The extension looks for FPC in your `PATH` or in common install locations.

**Windows**
- Download from [freepascal.org](https://www.freepascal.org/download.html)
- Add the FPC `bin` directory to your system `PATH`, or install to a standard location such as `C:\FPC\<version>\bin\i386-win32\`

**Linux / macOS**
- Use your package manager: `apt install fpc`, `brew install fpc`, etc.
- Ensure `fpc` is in your `PATH`

## Installation

### From VSIX

1. Obtain a `.vsix` file (from a release or by building — see *From source* below)
2. In VS Code, open the Command Palette (**Ctrl+Shift+P** / **Cmd+Shift+P**)
3. Run **Extensions: Install from VSIX...**
4. Select the `.vsix` file
5. Reload VS Code when prompted

### From source (development)

1. Clone the repository
2. Install dependencies and compile:

   ```bash
   npm install
   npm run compile
   ```

3. Press **F5** in VS Code to launch an Extension Development Host with the extension loaded
4. To package a `.vsix` for distribution:

   ```bash
   npm run vscode:prepublish
   npx vsce package
   ```

   Then install the generated `.vsix` via **Extensions: Install from VSIX...**

## Usage

Open a `.pas` or `.pp` file. The extension activates automatically.

- **Save** — Runs the Free Pascal compiler; errors, warnings, and hints appear as inline diagnostics.
- **Go to definition** — Ctrl+click (Windows/Linux) or Cmd+click (macOS), or press F12 with the cursor on a symbol, to jump to its definition. Works for local symbols and symbols from units listed in the `uses` clause (units must be `.pas` or `.pp` in the same directory or workspace root).

## Project structure

```
pascal-lsp/
├── client/                 # VS Code extension client
│   └── src/extension.ts    # Language client setup
├── server/                 # LSP server
│   └── src/
│       ├── server.ts       # LSP connection, capabilities, definition provider
│       ├── diagnostics.ts  # FPC output parsing
│       ├── fpc.ts          # FPC discovery and compilation
│       └── navigation.ts   # Document symbols, go-to-definition (cross-file)
├── syntaxes/
│   └── pascal.tmLanguage.json
├── language-configuration.json
└── package.json
```

## Development

- **Compile:** `npm run compile`
- **Watch mode:** `npm run watch`
- **Debug:** Use the "Extension" launch configuration (F5) in VS Code

## License

See [LICENSE](LICENSE) if present.
