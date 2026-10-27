import { writeFile } from "node:fs/promises";

await writeFile(
  new URL("../build/package.json", import.meta.url),
  '{"type":"module"}\n',
);
