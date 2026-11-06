// Run with the dev server on 4179. Uses the existing Playwright dependency.
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const output = path.resolve(process.argv[2] || "docs/d1");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const checks = [];
async function check(label, action) {
  await action();
  checks.push({ label, passed: true });
}
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 900 },
      isMobile: width === 390,
      hasTouch: width === 390,
      reducedMotion: "reduce",
    });
    const errors = [],
      external = [],
      posts = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (!r.url().startsWith("http://127.0.0.1:4179")) external.push(r.url());
      if (r.method() === "POST") posts.push(r.url());
    });
    async function capture(name) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: path.join(output, `${width}-${name}.png`),
        fullPage: true,
      });
      await page.screenshot({
        path: path.join(output, `${width}-${name}-viewport.png`),
      });
      await check(
        `${width}/${name}: page has no horizontal overflow`,
        async () =>
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true),
      );
    }
    await page.goto("http://127.0.0.1:4179");
    await capture("entry");
    await check(
      `${width}: first screen explains purpose and sample entry`,
      async () => {
        await expect(page.locator(".brand")).toContainText(
          "病歴・就労状況等申立書",
        );
        await expect(
          page.getByRole("button", { name: "見本で試す", exact: true }),
        ).toBeInViewport();
      },
    );
    await page
      .getByRole("button", { name: "1. 受診しなかった期間がある" })
      .click();
    await page
      .getByRole("button", { name: "内容を確認して進む", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: /この内容で整理する|AI で読む（数秒かかります）/,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "ひとつ確認" }),
    ).toBeVisible();
    await check(
      `${width}: only one question; gap is explicitly unconfirmed`,
      async () => {
        await expect(page.locator(".question")).toHaveCount(1);
        await expect(
          page.locator(".question-timeline .unconfirmed"),
        ).toContainText("未確認");
      },
    );
    await page
      .getByRole("radio", { name: "通院していなかった", exact: true })
      .check();
    await capture("question");
    await page.reload();
    await check(
      `${width}: radio answer restores without creating a period`,
      async () => {
        await expect(
          page.getByRole("radio", { name: "通院していなかった", exact: true }),
        ).toBeChecked();
        expect(
          await page.evaluate(
            () =>
              JSON.parse(localStorage.getItem("ayumi-draft-v1")).events.length,
          ),
        ).toBe(3);
      },
    );
    await page.getByRole("button", { name: "下書きを見る →" }).click();
    await page
      .getByRole("navigation", { name: "時間をたどる", exact: true })
      .getByRole("button", { name: /^期間 2 / })
      .click();
    await capture("draft");
    await page.emulateMedia({ media: "print" });
    await check(
      `${width}: print keeps the table and all review items`,
      async () => {
        await expect(page.locator(".period-table")).toBeVisible();
        await expect(page.locator(".review-panel")).toBeVisible();
        await expect(
          page.getByRole("button", { name: "印刷・PDFに保存" }),
        ).not.toBeVisible();
      },
    );
    if (width === 1280)
      await page.pdf({
        path: path.join(output, "draft-print.pdf"),
        format: "A4",
        printBackground: true,
      });
    await page.emulateMedia({ media: "screen" });
    await page
      .getByRole("button", { name: "1 経過を書く（見本あり）" })
      .click();
    await page
      .getByRole("navigation", { name: "時間をたどる", exact: true })
      .getByRole("button", { name: /^期間 1 / })
      .click();
    const note = "朝起きられず、食事は家族に用意してもらった。";
    await page.getByLabel("この期間の経過", { exact: true }).fill(note);
    await capture("input");
    await page.getByRole("button", { name: "保存して休む" }).click();
    await check(
      `${width}: rest message shown only with successful saving`,
      async () => {
        await expect(page.getByRole("region", { name: "休憩" })).toContainText(
          "この端末の同じブラウザー",
        );
        await expect(page.locator(".save-state")).toContainText("保存済み");
      },
    );
    await page.reload();
    await check(
      `${width}: selected period and unfinished note resume`,
      async () => {
        await expect(page.locator(".selected-period")).toContainText(
          "2018/4/1",
        );
        await expect(
          page.getByLabel("この期間の経過", { exact: true }),
        ).toHaveValue(note);
      },
    );
    await page
      .getByRole("button", { name: "内容を確認して進む", exact: true })
      .click();
    await expect(page.locator(".send-panel")).toContainText(note);
    await page
      .getByRole("button", {
        name: /この内容で整理する|AI で読む（数秒かかります）/,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "ひとつ確認" }),
    ).toBeVisible();
    await check(
      `${width}: period edit uses the existing patch flow`,
      async () => {
        const state = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("ayumi-draft-v1")),
        );
        expect(state.events[0].daily.value).toBe(note);
        expect(state.events[0].hospital.value).toBe("青葉クリニック");
        expect(state.events.length).toBe(3);
      },
    );
    // Return to a deferred gap via the timeline: it must reopen that exact question.
    await page
      .getByRole("button", { name: "今は分からない・後で確認" })
      .click();
    if (width === 390)
      await page
        .getByRole("button", { name: "期間の一覧を見る", exact: true })
        .click();
    await page
      .getByRole("navigation", { name: "時間をたどる", exact: true })
      .getByRole("button", { name: /発病から最初の期間/ })
      .click();
    await check(
      `${width}: deferred gap can be reopened from the timeline`,
      async () => {
        await expect(page.locator(".question")).toContainText(
          "発病から最初の期間",
        );
      },
    );
    await check(
      `${width}: no console errors, external requests, or health-data POSTs`,
      async () => {
        expect(errors).toEqual([]);
        expect(external).toEqual([]);
        expect(posts).toEqual([]);
      },
    );
    await page.close();
  }
  // Failed storage must never show the green successful-save indicator.
  const failed = await browser.newPage();
  await failed.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
  });
  await failed.goto("http://127.0.0.1:4179");
  await check("storage failure: successful save indicator absent", async () => {
    await expect(failed.locator(".saved")).toHaveCount(0);
    await expect(failed.getByRole("alert")).toContainText("保存できません");
  });
  await failed.close();
  await writeFile(
    path.join(output, "design-checks.json"),
    JSON.stringify({ passed: checks.length, failed: 0, checks }, null, 2) +
      "\n",
  );
  console.log(`${checks.length} design checks passed. Captures: ${output}`);
} finally {
  await browser.close();
}
