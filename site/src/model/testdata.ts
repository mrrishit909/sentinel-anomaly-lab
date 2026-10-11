/** Test helper: read a published artifact from public/data (node only). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
export const art = <T = any>(name: string): T => JSON.parse(readFileSync(join(__dirname, "../../public/data", name), "utf-8")) as T; // eslint-disable-line @typescript-eslint/no-explicit-any
