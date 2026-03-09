# Changelog

All notable changes to Pascal Language Support are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2025-03-09

### Added

- **Document formatting** — Format Pascal documents (Ctrl+Shift+I)
- **Auto-completion** — Keywords, symbols from current file, cross-unit completions, and member access (e.g. `obj.` for fields and methods)
- **Hover information** — Hover over identifiers to see kind and full declaration
- **Run & Build code lens** — Click ▶ Run or ⚙ Build above `program` declarations
- **Diagnostics** — Compile-time errors, warnings, hints from FPC on save
- **Go to definition** — F12 or Ctrl+Click across current file and units in `uses`
- **Document outline** — Breadcrumb and Outline panel for procedures, functions, types, etc.
- **Settings** — `pascal.fpcPath`, `pascal.compilerFlags`, `pascal.runInTerminal`, `pascal.showOutputOnBuild`

### Fixed

- Code lens run command path handling
- Command palette duplication
- General bug fixes and code deduplication in server modules

## [0.1.0] - Initial release

- Syntax highlighting, go-to-definition, diagnostics via Free Pascal compiler
- Basic extension setup for VS Code
