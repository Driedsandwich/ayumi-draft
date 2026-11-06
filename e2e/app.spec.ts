import { test, expect, type Page } from "@playwright/test";
import { mockExtract } from "../src/core/mock";
const source =
  "2023年4月1日から現在まで、ふたば医院に通院している。食事は家族が作る。仕事は休んでいる。";
async function openSettings(page: Page) {
  if (
    !(await page
      .locator("#settings")
      .evaluate((el) => (el as HTMLDetailsElement).open))
  )
    await page.getByText("設定と保存について", { exact: true }).click();
}
async function organize(page: Page) {
  await page
    .getByRole("button", { name: "内容を確認して進む", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: /この内容で整理する|AI で読む（数秒かかります）/,
    })
    .click();
  await expect(page.getByRole("heading", { name: "ひとつ確認" })).toBeVisible();
}
// Questions are now displayed one at a time. Navigate without changing answers
// or deferring any question; the original persistence assertions stay intact.
async function showQuestion(page: Page, text: string) {
  for (let i = 0; i < 60; i++) {
    if (await page.locator(".question").filter({ hasText: text }).count())
      return;
    const next = page.getByRole("button", { name: "次の確認", exact: true });
    if (await next.isDisabled()) {
      const previous = page.getByRole("button", {
        name: "前の確認",
        exact: true,
      });
      while (await previous.isEnabled()) await previous.click();
    } else await next.click();
  }
  throw new Error(`確認項目が見つかりません: ${text}`);
}
for (const [i, label] of [
  "受診しなかった期間がある",
  "就職と離職をくり返した",
  "初診日を思い出せない",
].entries())
  test(`見本${i + 1}の最後まで・保存・印刷`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let posts = 0;
    page.on("request", (r) => {
      if (r.method() === "POST") posts++;
    });
    await page.goto("/");
    await page.getByRole("button", { name: `${i + 1}. ${label}` }).click();
    await organize(page);
    await expect(page.locator(".question")).toHaveCount(
      Math.min(5, await page.locator(".question").count()),
    );
    const hasQuestion = (await page.locator(".question").count()) > 0;
    if (hasQuestion)
      await page
        .getByRole("button", { name: "今は分からない・後で確認" })
        .first()
        .click();
    await page.getByRole("button", { name: "下書きを見る →" }).click();
    await expect(page.locator(".period")).not.toHaveCount(0);
    const before = await page.locator(".period").count();
    await page.reload();
    await expect(page.locator(".period")).toHaveCount(before);
    if (hasQuestion) {
      const remaining = page
        .locator(".review-panel summary")
        .filter({ hasText: "残り" });
      if (await remaining.count()) await remaining.click();
    }
    if (hasQuestion)
      await expect(
        page.getByText("後で確認", { exact: true }).first(),
      ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (i === 0) {
      await page.screenshot({
        path: `docs/${info.project.name}-draft.png`,
        fullPage: true,
      });
    }
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".period-table")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "印刷・PDFに保存" }),
    ).not.toBeVisible();
    if (i === 0 && info.project.name === "desktop")
      await page.pdf({
        path: "docs/sample-draft.pdf",
        format: "A4",
        printBackground: true,
      });
    expect(posts).toBe(0);
    expect(errors).toEqual([]);
  });
test("未知の入力・聞き返しへの回答と再検査", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("経過の文").fill(source.replace("ふたば医院に", ""));
  await organize(page);
  await showQuestion(page, "受診した医療機関の呼び名");
  const q = page
    .locator(".question")
    .filter({ hasText: "受診した医療機関の呼び名" });
  await q.getByLabel("あなたの回答").fill("ふたば医院");
  await page.reload();
  await showQuestion(page, "受診した医療機関の呼び名");
  const restored = page
    .locator(".question")
    .filter({ hasText: "受診した医療機関の呼び名" });
  await expect(restored.getByLabel("あなたの回答")).toHaveValue("ふたば医院");
  await restored.getByRole("button", { name: "この回答を確かめる" }).click();
  await page
    .getByRole("button", {
      name: /この内容で整理する|AI で読む（数秒かかります）/,
    })
    .click();
  await expect(
    page.locator(".question").filter({ hasText: "受診した医療機関の呼び名" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "下書きを見る →" }).click();
  await expect(page.locator(".period-meta")).toContainText("ふたば医院");
  await expect(page.locator(".period")).toContainText("食事は家族が作る");
  await page.reload();
  await expect(page.locator(".period-meta")).toContainText("ふたば医院");
});
test("削除した情報が再読込で戻らない", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("経過の文").fill(source);
  await organize(page);
  page.on("dialog", (d) => d.accept());
  await openSettings(page);
  await page.getByRole("button", { name: "保存した内容を消す" }).click();
  await page.reload();
  await expect(page.getByLabel("経過の文")).toHaveValue("");
  expect(
    await page.evaluate(() => localStorage.getItem("ayumi-draft-v1")),
  ).not.toContain("ふたば");
});
test("AI送信の同意と通信エラーで前の下書きを保持", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/analyze", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          provider: "openai",
          destination: "https://synthetic-test.example",
        },
      });
    posts++;
    return route.fulfill({
      status: 502,
      json: { error: "テストの通信失敗。入力は残っています。" },
    });
  });
  await page.goto("/");
  await page.getByLabel("経過の文").fill(source);
  await organize(page);
  await page.getByRole("button", { name: "下書きを見る →" }).click();
  await page.getByRole("button", { name: "1 経過を書く（見本あり）" }).click();
  await openSettings(page);
  await page.getByLabel("整理の方法").selectOption("live");
  await page
    .getByRole("button", { name: "内容を確認して進む", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: /この内容で整理する|AI で読む（数秒かかります）/,
    }),
  ).toBeDisabled();
  expect(posts).toBe(0);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", {
      name: /この内容で整理する|AI で読む（数秒かかります）/,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("通信失敗");
  await page.getByRole("button", { name: "戻って直す" }).click();
  await page.getByRole("button", { name: "3 様式の順の下書きを見る" }).click();
  await expect(page.locator(".period")).toContainText("ふたば医院");
  expect(posts).toBe(1);
});
test("本番経路の応答をブラウザーでも検査", async ({ page }) => {
  await page.route("**/api/analyze", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          provider: "openai",
          destination: "https://synthetic-test.example",
        },
      });
    return route.fulfill({
      json: { data: mockExtract(source), provider: "openai", calls: 1 },
    });
  });
  await page.goto("/");
  await openSettings(page);
  await page.getByLabel("整理の方法").selectOption("live");
  await page.getByLabel("経過の文").fill(source);
  await page
    .getByRole("button", { name: "内容を確認して進む", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", {
      name: /この内容で整理する|AI で読む（数秒かかります）/,
    })
    .click();
  await expect(page.getByRole("heading", { name: "ひとつ確認" })).toBeVisible();
});
test("壊れた保存内容から復帰", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("ayumi-draft-v1", "{broken"));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "保存内容を読み込めませんでした",
  );
  await page.getByLabel("経過の文").fill(source);
  await organize(page);
});

test("途中の別回答と期間編集の文も保存する", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("経過の文")
    .fill("2023年4月1日から現在まで、通院している。");
  await organize(page);
  await showQuestion(page, "食事・外出・家事");
  const daily = page
    .locator(".question")
    .filter({ hasText: "食事・外出・家事" });
  await daily.getByLabel("あなたの回答").fill("家事は家族に頼んだ");
  await showQuestion(page, "受診した医療機関の呼び名");
  const hospital = page
    .locator(".question")
    .filter({ hasText: "受診した医療機関の呼び名" });
  await hospital.getByLabel("あなたの回答").fill("ふたば医院");
  await hospital.getByRole("button", { name: "この回答を確かめる" }).click();
  await page
    .getByRole("button", {
      name: /この内容で整理する|AI で読む（数秒かかります）/,
    })
    .click();
  await showQuestion(page, "食事・外出・家事");
  await expect(
    page
      .locator(".question")
      .filter({ hasText: "食事・外出・家事" })
      .getByLabel("あなたの回答"),
  ).toHaveValue("家事は家族に頼んだ");
  await page.getByRole("button", { name: "下書きを見る →" }).click();
  await page.getByText("この期間の内容を直す", { exact: true }).click();
  await page.getByLabel("直す欄").selectOption("work");
  await page.getByLabel("本人の言葉で書き直す").fill("短時間の仕事をしていた");
  await page.reload();
  await page.getByText("この期間の内容を直す", { exact: true }).click();
  await expect(page.getByLabel("直す欄")).toHaveValue("work");
  await expect(page.getByLabel("本人の言葉で書き直す")).toHaveValue(
    "短時間の仕事をしていた",
  );
});
test("中止後の遅い応答で削除内容が復活しない", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let submitted = false;
  await page.route("**/api/analyze", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          provider: "openai",
          destination: "https://synthetic-test.example",
        },
      });
    submitted = true;
    await gate;
    await route
      .fulfill({
        json: { data: mockExtract(source), provider: "openai", calls: 1 },
      })
      .catch(() => {});
  });
  await page.goto("/");
  await openSettings(page);
  await page.getByLabel("整理の方法").selectOption("live");
  await page.getByLabel("経過の文").fill(source);
  await page
    .getByRole("button", { name: "内容を確認して進む", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", {
      name: /この内容で整理する|AI で読む（数秒かかります）/,
    })
    .click();
  await expect.poll(() => submitted).toBe(true);
  await page.getByRole("button", { name: "処理を中止する" }).click();
  page.on("dialog", (d) => d.accept());
  await openSettings(page);
  await page.getByRole("button", { name: "保存した内容を消す" }).click();
  release();
  await expect(page.getByLabel("経過の文")).toHaveValue("");
  await page.reload();
  await expect(page.getByLabel("経過の文")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "3 様式の順の下書きを見る" }),
  ).toBeDisabled();
});
