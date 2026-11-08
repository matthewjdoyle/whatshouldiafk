# Agent Instructions for whatshouldiafk

## Project Overview

- A React + Vite + Tauri application built with TypeScript and Tailwind CSS.
- Serves as an OSRS (Old School RuneScape) AFK reference table, primarily web-based but bundleable as a desktop app via Tauri.
- Calculates xp rates, AFK durations, and uses live grand exchange data for profit/loss.

## Codebase Structure

- `src/`: Main frontend source directory (React components, hooks, calculations).
- `src/data/methods.json`: The core data file. **This is where new AFK methods are added.** You do not need to write Rust or React code to add a new method, just update this JSON file with correct OSRS Wiki ID numbers.
- `src-tauri/`: Rust backend for the Tauri desktop application wrapper.
- `scripts/`: Contains utility scripts (e.g., generating previews using puppeteer).

## Development Commands

- Node.js (v22.12+) and Rust are required for desktop development. Web development only needs Node.js.
- Package Manager: `npm`
- Run dev server (with Tauri desktop app): `npx tauri dev`
- Run web dev server only: `npm run dev`
- Lint code: `npm run lint` (uses `oxlint`)
- Run regression tests: `npm test`
- Smoke-test the built web app with mocked GE responses: `npm run build`, then `npm run test:browser`
- Build for production (web): `npm run build`
- Build Tauri desktop app: `npx tauri build`

## Guidelines

- Follow TypeScript best practices and maintain existing architectural patterns.
- Use Tailwind CSS for styling changes, supplementing `App.css` and `index.css` only when necessary.
- When adding or modifying methods in `methods.json`, ensure accurate input/output item IDs from the official OSRS Wiki.
- Ensure `oxlint` passes for any TypeScript/JavaScript changes.
- When changing a workflow with async work, timers, or multiple entry points, update the [state machine inventory](docs/state-machines.md) and add or update tests for the affected transitions.
