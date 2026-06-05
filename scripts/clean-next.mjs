import { existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const projectRoot = process.cwd();
const nextDir = join(projectRoot, ".next");

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function hasActiveNextDevProcess() {
  const nextDevPattern = /(?:^|\s)(?:.*[/\\])?next(?:\.cmd)?\s+dev(?:\s|$)/;
  const devOutputDir = join(nextDir, "dev");

  return run("ps", ["-axo", "pid=,command="])
    .split("\n")
    .some((line) => {
      const command = line.trim();
      const isProjectProcess =
        command.includes(projectRoot) || command.includes(devOutputDir);

      return (
        isProjectProcess &&
        (nextDevPattern.test(command) || command.includes(devOutputDir))
      );
    });
}

function hasOpenNextOutputFiles() {
  if (!existsSync(nextDir)) return false;

  return run("lsof", ["-n", "+D", nextDir])
    .split("\n")
    .slice(1)
    .some(Boolean);
}

if (hasActiveNextDevProcess() || hasOpenNextOutputFiles()) {
  console.error(
    "Refusing to delete .next while it appears to be in use. Stop the dev server before building.",
  );
  process.exit(1);
}

rmSync(nextDir, { recursive: true, force: true });
