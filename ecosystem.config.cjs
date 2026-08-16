const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRoot = __dirname;
const instanceConfig = process.env.PAPERCLIP_CONFIG_PATH
  ?? path.join(os.homedir(), ".paperclip/instances/default/config.json");
const tsxDist = path.join(repoRoot, "cli/node_modules/tsx/dist");

module.exports = {
  apps: [
    {
      name: "paperclip",
      cwd: repoRoot,
      script: path.join(repoRoot, "cli/src/index.ts"),
      interpreter: process.execPath,
      node_args: [
        "--require",
        path.join(tsxDist, "preflight.cjs"),
        "--import",
        pathToFileURL(path.join(tsxDist, "loader.mjs")).href,
      ],
      args: ["run", "--config", instanceConfig],
      env: {
        PAPERCLIP_UI_BASE_PATH: "/af",
      },
      autorestart: true,
      watch: false,
      treekill: false,
      kill_timeout: 300_000,
    },
  ],
};
