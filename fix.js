const fs = require("fs");
const content = fs.readFileSync("client/components/apps/Defender.tsx", "utf8");
fs.writeFileSync(
  "client/components/apps/Defender.tsx",
  content.replace(/\\\`/g, "`").replace(/\\\$/g, "$"),
);
