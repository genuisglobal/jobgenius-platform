import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// The extension runner (apps/extension/runner) and the cloud runner
// (apps/runner/src) are two separate implementations that each carry their own
// copy of the per-ATS host + apply/submit hint tables for the "hosted ATS"
// adapters. They MUST stay in sync — a silent divergence means an ATS behaves
// differently depending on which runner processed it. Consolidating the two
// engines into one shared module is a larger refactor; until then this guard
// fails CI the moment the two tables drift.
//
// Note: confirmation phrases are intentionally NOT compared here — the extension
// now sources them from runner/phrases.js (with i18n seeds) while the cloud
// runner keeps its own CONFIRM_PHRASES list.

const here = path.dirname(fileURLToPath(import.meta.url));

type HostedEntry = {
  id: string;
  hosts: string[];
  applyEntry: string[];
  submit: string[];
};

// Pull the `const HOSTED_ADAPTERS = [ ... ];` array literal out of a runner
// adapter file and evaluate it. The literal is pure data (arrays of objects of
// string arrays), so evaluating just the captured literal is safe.
function loadHostedTable(relPath: string): Record<string, HostedEntry> {
  const src = readFileSync(path.resolve(here, relPath), "utf8");
  // Extension: `const HOSTED_ADAPTERS = [...]`; cloud: `const HOSTED_ADAPTER_CONFIGS = [...]`.
  const match = src.match(/HOSTED_ADAPTER\w*\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error(`HOSTED_ADAPTER* table not found in ${relPath}`);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const rows = new Function(`return ${match[1]};`)() as Array<Record<string, unknown>>;

  const table: Record<string, HostedEntry> = {};
  for (const row of rows) {
    // Extension keys the entry as `type`; the cloud runner keys it as `name`.
    const id = String(row.type ?? row.name);
    table[id] = {
      id,
      hosts: row.hosts as string[],
      applyEntry: row.applyEntry as string[],
      submit: row.submit as string[],
    };
  }
  return table;
}

describe("hosted-ATS adapter tables — extension vs cloud runner parity", () => {
  const extension = loadHostedTable("../../extension/runner/adapters/hosted-ats.js");
  const cloud = loadHostedTable("../../runner/src/adapters/hosted-ats.js");

  it("cover the same set of ATS types", () => {
    expect(Object.keys(extension).sort()).toEqual(Object.keys(cloud).sort());
  });

  it("have identical host + apply-entry + submit hint tables per ATS", () => {
    for (const id of Object.keys(extension)) {
      expect(cloud[id], `cloud runner is missing hosted adapter "${id}"`).toBeTruthy();
      expect(extension[id].hosts, `${id} hosts diverged`).toEqual(cloud[id].hosts);
      expect(extension[id].applyEntry, `${id} applyEntry diverged`).toEqual(
        cloud[id].applyEntry
      );
      expect(extension[id].submit, `${id} submit diverged`).toEqual(cloud[id].submit);
    }
  });
});
