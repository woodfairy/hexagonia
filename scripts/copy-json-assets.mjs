import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);

if (args.length === 0 || args.length % 2 !== 0) {
  throw new Error("Expected one or more <source> <destination> path pairs.");
}

for (let index = 0; index < args.length; index += 2) {
  const sourcePath = args[index];
  const destinationPath = args[index + 1];

  if (!sourcePath || !destinationPath) {
    throw new Error("Missing source or destination path.");
  }

  const source = resolve(process.cwd(), sourcePath);
  const destination = resolve(process.cwd(), destinationPath);

  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}
