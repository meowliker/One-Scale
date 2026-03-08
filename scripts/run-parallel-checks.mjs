import { spawn } from "node:child_process";

const tasks = [
  { name: "lint", command: "npm", args: ["run", "lint"] },
  { name: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { name: "test", command: "npm", args: ["run", "test"] },
];

const running = new Map();
let hasFailure = false;

function prefixAndWrite(name, data, stream) {
  const lines = data.toString().split("\n");
  for (const line of lines) {
    if (!line) continue;
    stream.write(`[${name}] ${line}\n`);
  }
}

function stopOtherTasks(exceptName) {
  for (const [name, proc] of running.entries()) {
    if (name !== exceptName && !proc.killed) {
      proc.kill("SIGTERM");
    }
  }
}

async function runTask(task) {
  return new Promise((resolve) => {
    const proc = spawn(task.command, task.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      shell: false,
    });

    running.set(task.name, proc);

    proc.stdout.on("data", (data) => prefixAndWrite(task.name, data, process.stdout));
    proc.stderr.on("data", (data) => prefixAndWrite(task.name, data, process.stderr));

    proc.on("exit", (code, signal) => {
      running.delete(task.name);
      if (signal) {
        resolve({ name: task.name, code: 1, signal, canceled: hasFailure });
        return;
      }
      resolve({ name: task.name, code: code ?? 1, signal: null, canceled: false });
    });
  });
}

console.log("Running lint, typecheck, and test in parallel...");
const results = await Promise.all(
  tasks.map(async (task) => {
    const result = await runTask(task);
    if (result.code !== 0 && !hasFailure) {
      hasFailure = true;
      stopOtherTasks(result.name);
    }
    return result;
  })
);

const failed = results.filter((result) => result.code !== 0 && !result.canceled);
const canceled = results.filter((result) => result.canceled);
if (failed.length > 0) {
  console.error("\nParallel checks failed:");
  for (const result of failed) {
    console.error(`- ${result.name} (exit code ${result.code})`);
  }
  if (canceled.length > 0) {
    console.error("\nCanceled after first failure:");
    for (const result of canceled) {
      console.error(`- ${result.name}`);
    }
  }
  process.exit(1);
}

console.log("\nParallel checks passed. Running production build...");
const buildResult = await runTask({ name: "build", command: "npm", args: ["run", "build"] });

if (buildResult.code !== 0) {
  console.error(`\nBuild failed (exit code ${buildResult.code}).`);
  process.exit(1);
}

console.log("\nAll checks passed.");
