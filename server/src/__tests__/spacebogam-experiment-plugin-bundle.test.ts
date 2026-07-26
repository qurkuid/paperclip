import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import manifest from "../../../packages/plugins/plugin-spacebogam-experiments/src/manifest.js";
import { validatePluginMigrationStatement } from "../services/plugin-database.js";
import { pluginManifestValidator } from "../services/plugin-manifest-validator.js";

describe("bundled Spacebogam experiment plugin", () => {
  it("passes the same manifest validator used at install time", () => {
    const result = pluginManifestValidator().parse(manifest);

    expect(result.success).toBe(true);
    if (result.success === false) {
      throw new Error(result.errors);
    }
    expect(result.manifest.id).toBe("paperclipai.plugin-spacebogam-experiments");
  });

  it("uses a native single-segment company route", () => {
    const slots = manifest.ui?.slots ?? [];
    const sidebar = slots.find((slot) => slot.type === "sidebar");
    const page = slots.find((slot) => slot.type === "page");
    const routeSidebar = slots.find((slot) => slot.type === "routeSidebar");

    expect(sidebar).not.toHaveProperty("routePath");
    expect(page?.routePath).toBe("spacebogam-experiments");
    expect(routeSidebar?.routePath).toBe("spacebogam-experiments");
  });

  it("passes every migration statement through the production SQL guard", () => {
    const migration = readFileSync(
      new URL(
        "../../../packages/plugins/plugin-spacebogam-experiments/migrations/001_spacebogam_experiments.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const statements = migration.split(";").map((statement) => statement.trim()).filter(Boolean);
    const namespace = "plugin_spacebogam_experiments_1504d837a1";
    const coreReadTables = manifest.database?.coreReadTables ?? [];

    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      expect(() => validatePluginMigrationStatement(
        statement,
        namespace,
        coreReadTables,
      )).not.toThrow();
    }
  });
});
