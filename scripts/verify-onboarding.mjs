// Local walkthrough of the new entry points. Existing evaluation/tests are unchanged.
// Start Vite on 4179, then: node scripts/verify-onboarding.mjs <output-directory>
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const output = path.resolve(process.argv[2] || "docs/onboarding");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const checks = [];
const cost =
  "このページを使っても、あなたにお金はかかりません（AI の代金は作者が持ちます）。見本は AI を呼びません。";
async function check(label, run) {
  await run();
  checks.push({ label, passed: true });
}
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 900 },
      isMobile: width === 390,
      hasTouch: width === 390,
      reducedMotion: "reduce",
    });
    const errors = [],
      posts = [],
      external = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.method() === "POST") posts.push(r.url());
      if (!r.url().startsWith("http://127.0.0.1:4179")) external.push(r.url());
    });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    // Simulate a connected AI and a late configuration response, entirely locally.
    await page.route("**/api/analyze", async (route) => {
      if (route.request().method() !== "GET")
        return route.fulfill({
          status: 502,
          json: { error: "送信しない検証です" },
        });
      await gate;
      return route.fulfill({
        json: {
          provider: "openai",
          destination: "https://synthetic-test.example",
        },
      });
    });
    const readState = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("ayumi-draft-v1")));
    async function capture(name, target) {
      if (target)
        await page
          .locator(target)
          .evaluate((el) => el.scrollIntoView({ block: "start" }));
      else await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({
        path: path.join(output, `${width}-${name}-viewport.png`),
      });
      await page.screenshot({
        path: path.join(output, `${width}-${name}-full.png`),
        fullPage: true,
      });
      await check(`${width}/${name}: 横にはみ出さない`, async () => {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      });
    }
    await page.goto("http://127.0.0.1:4179");
    await check(
      `${width}: 最初の表示で3段・料金・見本ボタンが読める`,
      async () => {
        await expect(page.locator(".step-status")).toHaveText("手順 1 / 3");
        await expect(page.locator(".workflow li")).toHaveCount(3);
        await expect(
          page.locator(".workflow [aria-current=step]"),
        ).toContainText("経過を書く（見本あり）");
        const button = page.getByRole("button", {
          name: "見本で試す",
          exact: true,
        });
        await expect(button).toBeInViewport({ ratio: 1 });
        await expect(button).toHaveAccessibleDescription(
          "架空の経過が入り、AI を使わず最後まで試せます。",
        );
        await expect(page.locator(".welcome .cost-notice")).toContainText(cost);
        await expect(page.locator(".welcome .cost-notice")).toBeInViewport({
          ratio: 1,
        });
        await expect(page.locator(".welcome .cost-notice")).toContainText(
          "ログイン不要",
        );
        await expect(page.locator(".welcome .cost-notice")).toContainText(
          "支払い情報を入力する欄はありません",
        );
      },
    );
    await capture("00-entry");
    await page.getByRole("button", { name: "見本で試す", exact: true }).click();
    release();
    await expect(page.locator('#settings option[value="live"]')).toBeEnabled();
    await check(
      `${width}: 見本を一押しで入力し、遅いAI接続通知でも方法が変わらない`,
      async () => {
        await expect(page.getByLabel("経過の文")).not.toHaveValue("");
        expect((await readState()).mode).toBe("mock");
        expect(posts).toHaveLength(0);
      },
    );
    await capture("01-write", ".workspace > section");
    await page
      .getByRole("button", { name: "内容を確認して進む", exact: true })
      .click();
    await check(`${width}: 見本の確認画面はAIを使わないと明示`, async () => {
      await expect(page.locator(".send-panel")).toContainText("手順 1 / 3");
      await expect(page.locator(".send-panel")).toContainText(
        "外部へ送信しません",
      );
      await expect(page.locator(".send-panel .cost-notice")).toContainText(
        cost,
      );
      await expect(
        page.getByRole("button", {
          name: "この内容で整理する（AI は使いません）",
        }),
      ).toBeEnabled();
    });
    await capture("01-confirm", ".send-panel");
    await page
      .getByRole("button", { name: "この内容で整理する（AI は使いません）" })
      .click();
    await expect(
      page.getByRole("heading", { name: "ひとつ確認" }),
    ).toBeVisible();
    await check(`${width}: ②で現在地と後回しの進み方が分かる`, async () => {
      await expect(page.locator(".step-status")).toHaveText("手順 2 / 3");
      await expect(page.locator(".workflow [aria-current=step]")).toContainText(
        "期間と聞き返しに答える",
      );
      await expect(page.locator(".questions-section")).toContainText(
        "「下書きを見る」で③へ進めます",
      );
    });
    await capture("02-questions");
    await page
      .getByRole("button", { name: "今は分からない・後で確認" })
      .click();
    await page.getByRole("button", { name: "下書きを見る →" }).click();
    await check(`${width}: ③に下書きと戻り先がある`, async () => {
      await expect(page.locator(".step-status")).toHaveText("手順 3 / 3");
      await expect(page.locator(".workflow [aria-current=step]")).toContainText(
        "様式の順の下書きを見る",
      );
      await expect(page.locator(".period")).toHaveCount(3);
      await expect(
        page.getByRole("button", { name: "最初に戻る", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "自分の入力で試す", exact: true }),
      ).toBeVisible();
    });
    await capture("03-draft");
    await capture("03-next-actions", ".draft-heading");
    const draft = await readState();
    await page.getByRole("button", { name: "最初に戻る", exact: true }).click();
    await check(`${width}: 最初に戻っても下書きは残る`, async () => {
      await expect(page.locator(".step-status")).toHaveText("手順 1 / 3");
      expect((await readState()).events).toEqual(draft.events);
      await expect(page.getByLabel("経過の文")).toHaveValue(draft.text);
    });
    await page
      .getByRole("button", { name: "3 様式の順の下書きを見る" })
      .click();
    await page
      .getByRole("button", { name: "自分の入力で試す", exact: true })
      .click();
    await check(
      `${width}: 自分の入力へ切り替えると見本が空欄になる`,
      async () => {
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        await expect(page.getByLabel("経過の文")).toHaveValue("");
        await expect(page.getByLabel("経過の文")).toBeFocused();
        expect((await readState()).events).toHaveLength(0);
        expect((await readState()).mode).toBe("live");
        expect(posts).toHaveLength(0);
      },
    );
    await page
      .getByLabel("経過の文")
      .fill(
        "2023年4月から現在まで、通院していなかった。食事は家族に作ってもらった。",
      );
    await page
      .getByRole("button", { name: "内容を確認して進む", exact: true })
      .click();
    await check(
      `${width}: AIを動かすボタンは料金と同意の近くで明示`,
      async () => {
        const ai = page.getByRole("button", {
          name: "AI で読む（数秒かかります）",
          exact: true,
        });
        await expect(ai).toBeDisabled();
        await expect(page.locator(".send-panel .cost-notice")).toContainText(
          cost,
        );
        await page.getByRole("checkbox").check();
        await expect(ai).toBeEnabled();
        await page
          .locator(".send-panel .cost-notice")
          .evaluate((el) => el.scrollIntoView({ block: "center" }));
        await expect(ai).toBeInViewport({ ratio: 1 });
        await expect(page.locator(".send-panel .cost-notice")).toBeInViewport({
          ratio: 1,
        });
      },
    );
    await capture("ai-confirm", ".send-panel .cost-notice");
    await page.getByRole("button", { name: "戻って直す" }).click();
    await page
      .getByRole("button", { name: "自分の経過を書く", exact: true })
      .click();
    await check(`${width}: 本人が書いた文は再開しても消さない`, async () => {
      await expect(page.getByLabel("経過の文")).toContainText("2023年4月");
    });
    await check(
      `${width}: 全行程で外部送信・POST・画面エラーがゼロ`,
      async () => {
        expect(posts).toEqual([]);
        expect(external).toEqual([]);
        expect(errors).toEqual([]);
      },
    );
    await page.close();
  }
  await writeFile(
    path.join(output, "onboarding-checks.json"),
    JSON.stringify({ passed: checks.length, failed: 0, checks }, null, 2) +
      "\n",
  );
  console.log(`${checks.length} onboarding checks passed. Captures: ${output}`);
} finally {
  await browser.close();
}
