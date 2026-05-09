# Nexus AGI

Minimalist personal AGI agent scaffold for Node 24, TypeScript ESM, Ink, and MCP.

## Getting started

1. Install dependencies with `npm install`.
2. Run the guided setup with `npm run setup`.
3. Start the TUI with `npm run dev` during development or `npm start` after building.

## Scripts

- `npm run setup` launches the interactive config wizard.
- `npm run dev` runs the app in watch mode through `tsx`.
- `npm run build` emits ESM output into `dist/`.
- `npm start` runs the built app from `dist/index.js`.

## Layout

- `src/core/` contains the agent loop and state manager.
- `src/tui/` contains the Ink-based terminal UI.
- `src/config/` contains YAML persistence and the interactive wizard.
- `src/providers/` contains provider auth and client adapters.
- `src/tools/` contains the native registry and MCP bridge.

## Provider auth

Secrets are resolved in this order:

1. Environment variables from `.env` or the shell.
2. OS keychain when `keytar` is available.
3. `~/.agent/keys.json` as a fallback vault.

## Conversation history

The TUI restores the last transcript from `~/.agent/history.yaml` on startup. Use the `New chat` command to clear both the in-memory conversation and the saved transcript.

## MCP servers

Add stdio or streamable HTTP MCP servers in the setup wizard. The agent will discover tools at startup and prefix remote tool names with the server name.
