import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, sep } from "node:path";

const ROOT = process.cwd();
const distDir = join(ROOT, ".next");
const ignoredOutputDirs = new Set(["cache", "diagnostics", "node_modules"]);

const rejectedNames = [
  /^\.env($|\.)/,
  /\.pem$/i,
  /\.p12$/i,
  /\.sqlite$/i,
  /\.db$/i,
  /\.log$/i,
  /^\.DS_Store$/,
  /\.tsbuildinfo$/i,
];

function fail(message, details = []) {
  console.error(message);
  for (const detail of details) console.error(`- ${detail}`);
  process.exit(1);
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === distDir && ignoredOutputDirs.has(entry.name)) continue;
      walk(path, files);
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function envSecretValues() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /^\.env($|\.)/.test(entry.name) &&
        entry.name !== ".env.example",
    )
    .flatMap((entry) =>
      readFileSync(join(ROOT, entry.name), "utf8")
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map((match) => ({
          key: match[1],
          value: match[2].replace(/^['"]|['"]$/g, ""),
        }))
        .filter(({ value }) => value.length >= 8),
    );
}

if (!existsSync(distDir)) {
  fail("No .next build output found. Run npm run build first.");
}

if (existsSync(join(distDir, "dev"))) {
  fail("Release artifact check failed: .next/dev is present.");
}

if (!existsSync(join(distDir, "static"))) {
  fail("Release artifact check failed: .next/static is missing.");
}

if (!existsSync(join(distDir, "server"))) {
  fail("Release artifact check failed: .next/server is missing.");
}

const files = walk(distDir);
const unwantedFiles = files.filter((file) =>
  rejectedNames.some((pattern) => pattern.test(basename(file))),
);

if (unwantedFiles.length) {
  fail("Release artifact check failed: unwanted files are present.", unwantedFiles);
}

const secrets = envSecretValues();
const secretHits = [];

for (const file of files) {
  if (statSync(file).size === 0) continue;

  const contents = readFileSync(file);
  for (const { key, value } of secrets) {
    if (contents.includes(Buffer.from(value))) {
      secretHits.push(`${key} in ${file.split(sep).join("/")}`);
    }
  }
}

if (secretHits.length) {
  fail("Release artifact check failed: local env values found.", secretHits);
}

console.log(
  `Release output check passed (${files.length} files scanned in .next).`,
);
