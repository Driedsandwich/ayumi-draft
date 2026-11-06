import { afterEach, describe, it, expect, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { handler, rateTicket, ipTicket } from "../server/http";
import { createProvider } from "../server/providers";
const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
});
async function serve() {
  vi.stubEnv("AI_PROVIDER", "mock");
  const s = createServer(handler);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
}
describe("回数制限", () => {
  it("署名cookieで上限", () => {
    let cookie = "";
    for (let i = 0; i < 2; i++) {
      const r = rateTicket(cookie, "secret", 2, 1000);
      expect(r.allowed).toBe(true);
      cookie = r.cookie;
    }
    expect(rateTicket(cookie, "secret", 2, 1000).allowed).toBe(false);
    expect(rateTicket(cookie, "secret", 2, 61000).allowed).toBe(true);
  });
  it("偽造を検出", () =>
    expect(rateTicket("ayumi_rate=0.900.bad", "secret", 2, 1000).allowed).toBe(
      true,
    ));
  it("IPの窓", () => {
    expect(ipTicket("test-one", 1, 1000)).toBe(true);
    expect(ipTicket("test-one", 1, 1000)).toBe(false);
    expect(ipTicket("test-one", 1, 601000)).toBe(true);
  });
});
describe("HTTP", () => {
  it("設定だけ取得しno-store", async () => {
    const r = await fetch(await serve());
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await r.json()).provider).toBe("mock");
  });
  it("未知の入力でもAPIから下書き", async () => {
    const base = await serve();
    const r = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "extract",
        text: "2021年から現在まで、受診していない。",
      }),
    });
    expect(r.status).toBe(200);
    const v = await r.json();
    expect(v.calls).toBe(0);
    expect(v.data.events[0].start.value).toBe("2021年");
  });
  it("他サイトのOriginを拒否", async () => {
    const r = await fetch(await serve(), {
      method: "POST",
      headers: {
        Origin: "https://wrong.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(r.status).toBe(403);
  });
  it("不正JSON", async () => {
    const r = await fetch(await serve(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad",
    });
    expect(r.status).toBe(400);
  });
  it("過大な本文", async () => {
    const r = await fetch(await serve(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "extract", text: "あ".repeat(30000) }),
    });
    expect(r.status).toBe(400);
  });
  it("不正メソッド", async () =>
    expect((await fetch(await serve(), { method: "PUT" })).status).toBe(405));
  it("有料AIで制限用秘密がないなら閉じる", async () => {
    const base = await serve();
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.stubEnv("RATE_LIMIT_SECRET", "");
    const r = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "extract", text: "経過" }),
    });
    expect(r.status).toBe(503);
  });
});
describe("OpenAI互換provider", () => {
  const env = {
    AI_PROVIDER: "openai",
    AI_BASE_URL: "https://ai.example/v1",
    AI_MODEL: "configured-model",
    AI_API_KEY: "test-placeholder",
  };
  it("JSON形・接続先・認証", async () => {
    const fn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"events":[]}' } }],
          }),
        ),
    ) as unknown as typeof fetch;
    const p = createProvider(env, fn);
    await p.complete({ kind: "extract", text: "合成文" }, false);
    const call = vi.mocked(fn).mock.calls[0];
    expect(call[0]).toBe("https://ai.example/v1/chat/completions");
    const body = JSON.parse(call[1]?.body as string);
    expect(body.response_format.type).toBe("json_object");
    expect(body.messages[1].content).toContain("合成文");
  });
  it("HTTP不成功の本文を露出しない", async () => {
    const p = createProvider(
      env,
      async () => new Response("private data", { status: 500 }),
    );
    await expect(
      p.complete({ kind: "extract", text: "合成文" }, false),
    ).rejects.not.toThrow("private data");
  });
  it("不正JSONは再検査に渡す", async () => {
    const p = createProvider(env, async () => new Response("bad"));
    expect(
      await p.complete({ kind: "extract", text: "合成文" }, false),
    ).toBeNull();
  });
  it("http接続先を拒否", () =>
    expect(() =>
      createProvider({ ...env, AI_BASE_URL: "http://ai.example" }),
    ).toThrow());
  it("鍵がない本番はmockに黙って変えない", () =>
    expect(() => createProvider({ ...env, AI_API_KEY: "" })).toThrow());
});
