"use strict";

const path = require("node:path");

const dataDir = process.env.AUTOTHREADS_DATA_DIR;
if (!dataDir) {
  throw new Error("AUTOTHREADS_DATA_DIR is required");
}

module.exports = {
  app: {
    getPath(name) {
      if (name !== "userData") {
        throw new Error(`Unsupported Electron path requested by autoTHREADS: ${name}`);
      }
      return path.resolve(dataDir);
    },
  },
};
