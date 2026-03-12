import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve(import.meta.dirname, "../src/scenarioCatalog.json");
const destination = resolve(import.meta.dirname, "../dist/scenarioCatalog.json");

mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination);
