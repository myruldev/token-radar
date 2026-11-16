// Token Radar — the entrypoint for the make.fun Token Launch Radar bounty.
//
// What this program does, end to end:
//   1. Loads the sealed protocol snapshot (DefiLlama, 2026-11-14) from /input.
//   2. Scores every pre-token protocol with the radar-2 model in lib/model.ts.
//   3. Writes the ranked board to /output/board.json and the dashboard data to /output/data.js.
//   4. Copies the static dashboard and the three screenshots into /output.
//   5. Writes /output/dossier.json, the summary the judge reads, via the vendored make.fun code.
//
// It runs on Node 22 with the standard library only. Outside the grader's container, point
// it at a local folder instead of /output with MAKEFUN_OUTPUT_DIR:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// The folder this file lives in, so the dashboard and screenshots are found beside it.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// The gate's caps for the dossier: the text cap shapes the bytes, the rest refuse outright.
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read a `--flag value` or `--flag=value` argument, falling back when it is absent. */
function flagValue(flag: string, fallback: string): string {
  const argv = process.argv;
  const bare = argv.indexOf(`--${flag}`);
  if (bare !== -1 && bare + 1 < argv.length) return argv[bare + 1] as string;
  const joined = argv.find((a) => a.startsWith(`--${flag}=`));
  return joined === undefined ? fallback : joined.slice(flag.length + 3);
}

/** Stop with a message on stderr and a non-zero exit. */
function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

// --- Load the snapshot -------------------------------------------------------

const inputGiven = flagValue('input', '/input');
const snapshotPath = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(
    `no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`,
    2,
  );
}
const outputDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);

// The gate refuses a board that misses the watchlist, breaks rank order, or carries a bad
// farm plan. Refuse it here, before anything is written, so a bad board never reaches /output.
const problem = boardIssue(board, snapshot);
if (problem !== null) fail(`the model wrote a board the gate refuses: ${problem}`, 1);

// --- Write the board and the dashboard data -----------------------------------

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

// --- Copy the dashboard and the screenshots -----------------------------------

/**
 * Mirror one directory's plain files into `dest`, skipping dotfiles. Returns the names copied.
 * The dashboard is three files (index.html, app.js, app.css); the screenshots are three PNGs.
 */
function mirrorDir(src: string, dest: string): string[] {
  if (!existsSync(src)) return [];
  mkdirSync(dest, { recursive: true });
  const names: string[] = [];
  for (const entry of readdirSync(src)) {
    if (entry.startsWith('.')) continue;
    const from = join(src, entry);
    if (!statSync(from).isFile()) continue;
    copyFileSync(from, join(dest, entry));
    names.push(entry);
  }
  return names;
}

mirrorDir(join(repoRoot, 'dashboard'), join(outputDir, 'dashboard'));
const shots = mirrorDir(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
if (shots.length < 3) {
  fail(
    `screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`,
    1,
  );
}
for (const shot of shots) {
  if (!SHOT_NAME.test(shot)) {
    fail(`screenshots/${shot}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
  }
}

// --- Write the dossier last ---------------------------------------------------
//
// buildDossier rebuilds the summary from this /output and the judge compares the bytes, so
// it goes after every other file is in place.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: DOSSIER_TEXT_CAP,
    screenshots: SHOT_LIMIT,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outputDir, 'board.json')}, ${join(outputDir, 'data.js')}, ${join(outputDir, 'dashboard')} (3 files), ${join(outputDir, 'screenshots')} (${shots.length} images) and ${join(outputDir, 'dossier.json')}\n`,
);
