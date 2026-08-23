const fs = require("fs");
const content = fs.readFileSync("client/components/apps/Defender.tsx", "utf8");
const fixedContent = content.replace(/\\\`/g, "`").replace(/\\\$/g, "$");
fs.writeFileSync("client/components/apps/Defender.tsx", fixedContent);
