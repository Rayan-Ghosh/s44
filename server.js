#!/usr/bin/env node
/**
 * server.js — S40 development orchestration helper.
 *
 * WHAT THIS IS:
 *   A thin Node.js convenience wrapper that starts the authoritative S40
 *   backend (FastAPI, under apps/api) for local development. Node.js is
 *   NOT the S40 backend — FastAPI/Python is (see docs/ARCHITECTURE.md and
 *   CLAUDE.md's source-of-truth rules). This file exists because the team
 *   asked for a `server.js`, and the cleanest way to honor that request
 *   without creating a second, competing backend is to make it a
 *   development launcher: it spawns `uvicorn` from the project's Python
 *   virtual environment and streams its output.
 *
 * WHAT THIS IS NOT:
 *   - Not an HTTP server itself. It defines no routes and holds no
 *     business logic.
 *   - Not a replacement for `uvicorn app.main:app` — anyone comfortable
 *     with the Python side can run that directly instead (see README.md).
 *   - Not where apps/web (the future Next.js frontend) will live — when
 *     that's scaffolded, this file may be extended to launch it alongside
 *     the API, but that is a later, explicit decision, not implied here.
 *
 * USAGE:
 *   node server.js            Start the FastAPI dev server (reload on).
 *   node server.js --seed     Initialize/seed Avaran.db first, then start.
 *
 * Requires the Python virtual environment at .venv to already exist with
 * apps/api/requirements.txt installed (see README.md "Getting started").
 */

const { spawnSync, spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const REPO_ROOT = __dirname;
const IS_WINDOWS = process.platform === "win32";
const VENV_PYTHON = path.join(
  REPO_ROOT,
  ".venv",
  IS_WINDOWS ? "Scripts" : "bin",
  IS_WINDOWS ? "python.exe" : "python"
);

function fail(message) {
  console.error(`[server.js] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(VENV_PYTHON)) {
  fail(
    `Python virtual environment not found at ${VENV_PYTHON}.\n` +
      "Create it first: py -m venv .venv (Windows) or python3 -m venv .venv (macOS/Linux), " +
      "then install apps/api/requirements.txt — see README.md."
  );
}

const shouldSeed = process.argv.includes("--seed");

if (shouldSeed) {
  console.log("[server.js] Seeding Avaran.db (scripts/seed_database.py)...");
  const seed = spawnSync(VENV_PYTHON, [path.join(REPO_ROOT, "scripts", "seed_database.py")], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (seed.status !== 0) {
    fail("Database seeding failed. See output above.");
  }
}

console.log("[server.js] Starting FastAPI dev server (apps/api) via uvicorn...");
const api = spawn(
  VENV_PYTHON,
  ["-m", "uvicorn", "app.main:app", "--reload", "--app-dir", "apps/api"],
  { cwd: REPO_ROOT, stdio: "inherit" }
);

api.on("exit", (code) => {
  process.exit(code ?? 0);
});
