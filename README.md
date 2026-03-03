# Pascal Language Support

A VS Code extension providing language support for Pascal, including syntax highlighting and real-time diagnostics via the Free Pascal Compiler (FPC).

## Features

- **Syntax highlighting** — Full TextMate grammar for `.pas` and `.pp` files
- **Compile-time diagnostics** — Errors, warnings, hints, and notes from FPC displayed inline on save
- **Language configuration** — Block comments (`{ }`), line comments (`//`), brackets, and auto-closing pairs
- **LSP support** — Language Server Protocol for diagnostics and extensibility

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

### From source (development)

1. Clone the repository
2. Install dependencies and compile:

   ```bash
   npm install
   npm run compile
   ```

3. Press **F5** in VS Code to launch an Extension Development Host with the extension loaded
4. Alternatively, package as `.vsix`:

   ```bash
   npm run vscode:prepublish
   npx vsce package
   ```

   Then install the generated `.vsix` via **Extensions: Install from VSIX...**

## Usage

Open a `.pas` or `.pp` file. The extension activates automatically. When you save a file, the Free Pascal compiler is invoked and any errors, warnings, or hints appear as diagnostics in the editor.

## Project structure

```
pascal-lsp/
├── client/                 # VS Code extension client
│   └── src/extension.ts    # Language client setup
├── server/                 # LSP server
│   └── src/
│       ├── server.ts       # LSP connection, capabilities
│       ├── diagnostics.ts  # FPC output parsing
│       └── fpc.ts          # FPC discovery and compilation
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
