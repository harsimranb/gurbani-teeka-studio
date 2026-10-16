#!/usr/bin/env node
// Blocks a commit that touches folders owned by another person's workstreams.
// Ownership lives in .ownership.json; see _docs/06-team-workflow.md.
//
// Setup (once per clone):
//   git config core.hooksPath .githooks
//   git config eko.person A        # or B
//
// Usage:
//   node scripts/dev/check-ownership.mjs                 checks staged files (pre-commit)
//   node scripts/dev/check-ownership.mjs --files a b     checks the given paths (for testing)
//   node scripts/dev/check-ownership.mjs --whoami        prints your person and streams
//
// No dependencies, so it works before `pnpm install`.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const config = JSON.parse(readFileSync(join(root, '.ownership.json'), 'utf8'));

function gitConfig(key) {
  try {
    return execSync(`git config --get ${key}`, { encoding: 'utf8', cwd: root }).trim();
  } catch {
    return '';
  }
}

const matches = (file, prefix) => (prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix);

function ownerOf(file) {
  if (config.shared.some((p) => matches(file, p))) return { stream: 'SHARED', person: '*' };
  for (const [stream, prefixes] of Object.entries(config.streams)) {
    if (prefixes.some((p) => matches(file, p))) {
      const person = Object.entries(config.people).find(([, streams]) => streams.includes(stream))?.[0];
      return { stream, person };
    }
  }
  return { stream: 'UNMAPPED', person: null };
}

const args = process.argv.slice(2);
const person = (process.env.EKO_PERSON || gitConfig('eko.person')).toUpperCase();

if (!person || !config.people[person]) {
  console.error(
    `Ownership check: set who you are first, e.g.\n  git config eko.person A\n` +
      `Valid values: ${Object.keys(config.people).join(', ')}. See _docs/06-team-workflow.md.`,
  );
  process.exit(1);
}

if (args[0] === '--whoami') {
  console.log(`Person ${person}: ${config.people[person].join(', ')}`);
  process.exit(0);
}

const files =
  args[0] === '--files'
    ? args.slice(1)
    : execSync('git diff --cached --name-only --diff-filter=ACMRD', { encoding: 'utf8', cwd: root })
        .split('\n')
        .filter(Boolean);

const blocked = [];
const unmapped = [];
for (const file of files) {
  const { stream, person: owner } = ownerOf(file);
  if (stream === 'UNMAPPED') unmapped.push(file);
  else if (owner !== '*' && owner !== person) blocked.push({ file, stream, owner });
}

if (unmapped.length) {
  console.error('Ownership check: these paths have no owner in .ownership.json:');
  for (const f of unmapped) console.error(`  ${f}`);
  console.error('Add the folder to a stream (by agreement, in its own commit), or move the file into an owned folder.');
}
if (blocked.length) {
  console.error(`Ownership check: person ${person} is changing files owned by another workstream:`);
  for (const b of blocked) console.error(`  ${b.file}  →  ${b.stream} (person ${b.owner})`);
  console.error(
    'Unstage these files and ask the owner under "Requests between people" in WORKING_LOG.md.\n' +
      'Do not bypass this check with --no-verify.',
  );
}
if (unmapped.length || blocked.length) process.exit(1);
