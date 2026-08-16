#!/usr/bin/env node
import { runServer } from "./index.js";

void runServer().catch((error) => {
  console.error("Failed to start Naver Search Ads MCP server:", error instanceof Error ? error.message : error);
  process.exit(1);
});
