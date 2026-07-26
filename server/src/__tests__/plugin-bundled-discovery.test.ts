import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createDb } from "@paperclipai/db";
import { pluginRoutes } from "../routes/plugins.js";
import { errorHandler } from "../middleware/index.js";
import { pluginLoader } from "../services/plugin-loader.js";

function createApp() {
  const db = createDb("postgres://paperclip:paperclip@127.0.0.1:1/paperclip");
  const loader = pluginLoader(db, {
    enableLocalFilesystem: false,
    enableNpmDiscovery: false,
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const actor: NonNullable<typeof req.actor> = {
      type: "board",
      userId: "admin-1",
      source: "session",
      isInstanceAdmin: true,
      companyIds: [],
    };
    req.actor = actor;
    next();
  });
  app.use("/api", pluginRoutes(db, loader));
  app.use(errorHandler);
  return app;
}

describe("bundled plugin discovery", () => {
  it("exposes Spacebogam Experiments once as an experimental first-party bundle", async () => {
    const response = await request(createApp()).get("/api/plugins/examples").expect(200);
    const matches = response.body.filter((entry: { packageName?: string }) =>
      entry.packageName === "@paperclipai/plugin-spacebogam-experiments",
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      pluginKey: "paperclipai.plugin-spacebogam-experiments",
      displayName: "실험 운영",
      tag: "first-party",
      experimental: true,
    });
  });
});
