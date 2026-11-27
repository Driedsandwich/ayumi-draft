import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

let parent: string;
let root: string;
let script: string;
let sourceZip: string;

function track(...paths: string[]) {
  execFileSync("git", ["-C", root, "add", "--", ...paths]);
}

function entries(path: string): string[] {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import json, sys, zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist()))",
        path,
      ],
      { encoding: "utf8" },
    ),
  );
}

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), "ayumi-package-"));
  root = join(parent, "repo");
  script = join(root, "scripts", "package-source.py");
  sourceZip = join(parent, "ayumi-draft-source.zip");
  mkdirSync(join(root, "scripts"), { recursive: true });
  execFileSync("git", ["-C", root, "init", "-q"]);
  copyFileSync("scripts/package-source.py", script);
  writeFileSync(join(root, ".gitignore"), "*.local\n.vercel/\n");
  writeFileSync(join(root, "guide.md"), "案内");
  track(".gitignore", "guide.md", "scripts/package-source.py");
});

afterEach(() => rmSync(parent, { recursive: true, force: true }));

it("配布ZIPは追跡ファイルと生成した一覧だけを収める", () => {
  writeFileSync(join(root, "notes.local"), "手元のメモ");
  mkdirSync(join(root, ".vercel"));
  writeFileSync(join(root, ".vercel", "project.json"), "{}");
  writeFileSync(join(root, "draft.txt"), "下書き");
  execFileSync("python3", [script]);
  expect(entries(sourceZip).sort()).toEqual([
    "repo/.gitignore",
    "repo/SOURCE-MANIFEST.json",
    "repo/guide.md",
    "repo/scripts/package-source.py",
  ]);
});

it.each([".env.sample", ".vercel/info.txt", "example.pem"])(
  "秘密用の名前 %s が追跡されていれば配布ZIPを作らない",
  (path) => {
    if (path.startsWith(".vercel/")) mkdirSync(join(root, ".vercel"));
    writeFileSync(join(root, path), "配布対象の試験用メモ");
    execFileSync("git", ["-C", root, "add", "-f", "--", path]);
    expect(spawnSync("python3", [script]).status).not.toBe(0);
    expect(existsSync(sourceZip)).toBe(false);
  },
);

it("追跡されたシンボリックリンクがあれば配布ZIPを作らない", () => {
  symlinkSync("guide.md", join(root, "guide-copy.md"));
  track("guide-copy.md");
  expect(spawnSync("python3", [script]).status).not.toBe(0);
  expect(existsSync(sourceZip)).toBe(false);
});
