import fs from "node:fs";
import path from "node:path";

const assets = path.resolve("frontend/dist/assets");
const current = fs.readdirSync(assets)
  .filter((name) => /^MacroPanel-(?!D2lsIN-T)\S+\.js$/.test(name))
  .sort()
  .at(-1);
if (!current) throw new Error("MacroPanel chunk not found");
fs.copyFileSync(path.join(assets, current), path.join(assets, "MacroPanel-D2lsIN-T.js"));
