# Pascal LSP Architecture

This document describes how diagnostics, go-to-definition, the FPC (Free Pascal Compiler) integration, and the LSP server work together.

## Overview

```
Client (VS Code extension)  ←→  Server (LSP)  ←→  FPC (Free Pascal Compiler)
         │                           │                    │
         │  onDidSaveTextDocument    │      execFile      │
         │ ───────────────────────► │ ─────────────────► │
         │                           │    stderr output   │
         │    sendDiagnostics        │ ◄───────────────── │
         │ ◄──────────────────────   │                    │
```

The extension does not use a full Pascal parser. Diagnostics come from running the Free Pascal compiler and parsing its stderr output. Navigation (go-to-definition, document symbols) uses regex-based parsing.

---

## 1. Server (`server/src/server.ts`)

The LSP server is the central hub that handles client requests over JSON-RPC (stdin/stdout).

### Capabilities

- **Text document sync** — `Incremental` via `TextDocuments`
- **Definition provider** — Go to definition for procedures, functions, types, constants, variables, and units; supports cross-file navigation into units from the `uses` clause (Ctrl+click or F12)
- **Document symbol provider** — Outline / breadcrumb navigation for procedures, functions, types, constants, variables, units, and classes
- **Hover provider** — Stubbed, returns null

On `onInitialize`, the server stores workspace folder paths for unit resolution.

### Save handler

On `onDidSaveTextDocument`:

1. Check if the file is `.pas` or `.pp`
2. Convert the document URI to a file system path
3. Call `runDiagnostics(connection, { uri }, docPath)`
4. On error, send a single warning diagnostic with the error message

---

## 2. FPC module (`server/src/fpc.ts`)

Responsible for finding and invoking the Free Pascal compiler.

### `findFpcPath()`

Locates the FPC executable:

- Checks `PATH` via `which` (Unix) or `where` (Windows)
- On Windows, falls back to common install paths:
  - `C:\FPC\3.2.2\bin\i386-win32\fpc.exe`
  - `C:\FPC\2.6.4\bin\i386-win32\fpc.exe`
  - `Program Files (x86)\FPC\bin\fpc.exe`
  - `Program Files\FPC\bin\fpc.exe`
- Returns `null` if not found

### `compile(filePath)`

- Resolves FPC via `findFpcPath()`
- If not found, returns a synthetic error result
- Invokes: `fpc -Mdelphi -v0 <filePath>`
  - `-Mdelphi` — Delphi compatibility mode
  - `-v0` — Minimal verbosity
- Uses `execFile` for secure, shell-free execution
- Returns `{ stdout, stderr, code }`; on non-zero exit, errors are in `stderr`

---

## 3. Diagnostics module (`server/src/diagnostics.ts`)

Turns FPC compiler output into LSP diagnostics and sends them to the client.

### FPC error format

FPC writes errors in this form:

```
file(line,col): Severity: message
```

Or without column:

```
file(line): Severity: message
```

Example: `project1.pas(12,5): Error: Identifier not found "foo"`

### `parseDiagnostics(stderr, documentUri)`

- Uses a regex to match each error line
- Maps severity: `Error`/`Fatal` → Error, `Warning` → Warning, `Note`/`Hint` → Information
- Converts 1-based line/column to 0-based for LSP
- Filters to only include diagnostics for the current document (by basename)

### `runDiagnostics(connection, document, documentPath)`

1. Call `compile(documentPath)` to run FPC
2. Handle result:
   - **Success** (`code === 0`, no stderr) → empty diagnostics
   - **FPC not found** → single warning at line 0: "Free Pascal compiler not found..."
   - **Compilation errors** → parse stderr via `parseDiagnostics`
3. Fallback: if stderr is non-empty but parsing yields nothing, show the first line as a generic error at line 0
4. Send diagnostics via `connection.sendDiagnostics({ uri, diagnostics })`

---

## End-to-end flows

### Diagnostics (on save)

1. User saves a `.pas` or `.pp` file
2. Client notifies the server via `textDocument/didSave`
3. Server calls `runDiagnostics(connection, document, docPath)`
4. Diagnostics module calls `compile(docPath)` in `fpc.ts`
5. FPC module finds FPC, runs it, captures stdout/stderr
6. Diagnostics module parses stderr into `Diagnostic[]` with ranges, severity, and messages
7. Server sends `publishDiagnostics` to the client
8. VS Code renders squiggles and hover tooltips in the editor

### Go to definition (Ctrl+click / F12)

1. User Ctrl+clicks an identifier or presses F12
2. Client sends `textDocument/definition` with document URI and position
3. Server calls `findDefinition(document, position, workspaceRoots)`
4. Navigation module extracts identifier, searches current file, then used units, then resolves unit name to file
5. Server returns `Location` (uri + range) or `null`
6. VS Code opens the target file and reveals the range

---

## 4. Navigation module (`server/src/navigation.ts`)

Handles document symbols and go-to-definition. Uses regex-based parsing (no full Pascal parser).

### `getIdentifierAtPosition(text, position)`

Extracts the full identifier at the cursor by scanning backward and forward to word boundaries. Handles Ctrl+click when the cursor is in the middle of a word.

### `getSymbols(text)`

Parses Pascal source and extracts symbols: procedures, functions, types, constants, variables, units, and classes. Uses regex patterns on the code portion of each line (before `//`). Returns `PascalSymbol[]` with `selectionRange` for each symbol.

### `getUsedUnits(text)`

Parses all `uses` clauses and returns unit names (handles comma-separated lists and multi-line clauses).

### `findDefinition(document, position, searchDirs?)`

Resolution order:

1. **Current document** — Search for the identifier among local symbols
2. **Used units** — For each unit in the `uses` clause, resolve to a file (`.pas` or `.pp`) in the document directory or `searchDirs`, then search for the symbol
3. **Unit file** — If the identifier is a unit name (e.g. clicking `demo` in `uses demo;`), resolve to the unit file and return the unit declaration

Unit resolution searches: document directory first, then workspace roots (from `InitializeParams.workspaceFolders`).

---

## File reference

| File                   | Role                                                                 |
|------------------------|----------------------------------------------------------------------|
| `server/src/server.ts` | LSP connection, capabilities, save handler, definition provider, workspace roots |
| `server/src/fpc.ts`    | FPC discovery, compilation, result capture                           |
| `server/src/diagnostics.ts` | Parse FPC output, map to LSP diagnostics, send to client         |
| `server/src/navigation.ts` | Document symbols, go-to-definition (cross-file, units, workspace search) |
