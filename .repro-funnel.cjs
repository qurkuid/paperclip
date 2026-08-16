const { chromium } = require("playwright");

(async () => {
  const url = process.argv[2] || "http://localhost:3100/af/CMP/analytics/funnel";
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const reqs = [];
  page.on("response", (res) => {
    const u = res.url();
    if (u.includes("/api/")) reqs.push(`${res.status()} ${res.headers()["content-type"]} ${u}`);
  });
  page.on("requestfailed", (r) => {
    if (r.url().includes("/api/")) reqs.push(`FAILED ${r.url()} ${r.failure() && r.failure().errorText}`);
  });
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 400)}`));

  await page.goto(url, { waitUntil: "load", timeout: 30000 }).catch((e) => logs.push(`goto: ${e.message}`));
  await page.waitForTimeout(8000);

  console.log("=== URL ===", page.url());
  console.log("=== API REQUESTS ===");
  console.log(reqs.join("\n") || "(none)");
  console.log("=== CONSOLE ===");
  console.log(logs.join("\n") || "(none)");
  console.log("=== BODY TEXT ===");
  console.log((await page.locator("body").innerText()).slice(0, 3000));
  await browser.close();
})();
