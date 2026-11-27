import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseOperation } from "../src/core/schema";
import { runOperation } from "../src/core/pipeline";
import { createProvider, getPaidDestination } from "./providers";
type Request = IncomingMessage & { body?: unknown };
const maxBody = 80000;
const windowMs = 600_000;
const windows = new Map<string, { window: number; count: number }>();
export function ipTicket(key: string, max: number, now = Date.now()) {
  const window = Math.floor(now / windowMs);
  const prev = windows.get(key);
  const count = prev?.window === window ? prev.count + 1 : 1;
  if (windows.size >= 5000) {
    for (const [k, v] of windows) if (v.window !== window) windows.delete(k);
    if (windows.size >= 5000 && !windows.has(key)) return false;
  }
  windows.set(key, { window, count });
  return count <= max;
}
let paidWindow = -1;
let paidCalls = 0;
class PaidCallLimit extends Error {
  constructor(readonly retryAfter: number) {
    super();
  }
}
function countPaidCall(max: number, now = Date.now()) {
  const window = Math.floor(now / windowMs);
  if (window !== paidWindow) {
    paidWindow = window;
    paidCalls = 0;
  }
  if (paidCalls >= max)
    throw new PaidCallLimit(Math.ceil(((window + 1) * windowMs - now) / 1000));
  paidCalls++;
}
export function rateTicket(
  cookie: string | undefined,
  secret: string,
  max: number,
  now = Date.now(),
) {
  const window = Math.floor(now / 60000);
  let count = 0;
  const token = cookie?.match(/(?:^|;\s*)ayumi_rate=([^;]+)/)?.[1];
  if (token && token.length < 200) {
    const [w, c, sig] = token.split(".");
    const expected = createHmac("sha256", secret)
      .update(`${w}.${c}`)
      .digest("hex");
    if (
      sig &&
      /^[a-f0-9]{64}$/.test(sig) &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) &&
      Number(w) === window &&
      /^\d+$/.test(c)
    )
      count = Number(c);
  }
  const allowed = count < max,
    value = `${window}.${allowed ? count + 1 : count}`,
    sig = createHmac("sha256", secret).update(value).digest("hex");
  return {
    allowed,
    cookie: `ayumi_rate=${value}.${sig}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=60`,
    retryAfter: 60 - (Math.floor(now / 1000) % 60),
  };
}
async function readBody(req: Request) {
  if (req.body !== undefined) {
    const s =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(s) > maxBody) throw Error("size");
    return JSON.parse(s);
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const c of req) {
    bytes += Buffer.byteLength(c);
    if (bytes > maxBody) throw Error("size");
    chunks.push(Buffer.from(c));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function handler(req: Request, res: ServerResponse) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const reply = (status: number, data: unknown) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  const limited = (retryAfter: number) => {
    res.setHeader("Retry-After", String(retryAfter));
    return reply(429, {
      error:
        "回数の上限です。少し休んでからお試しください。下書きは残っています。",
    });
  };
  const secret = process.env.RATE_LIMIT_SECRET;
  const rateConfigured = !!secret && secret.length >= 32;
  const destination = rateConfigured ? getPaidDestination() : null;
  if (req.method === "GET")
    return reply(200, {
      provider: destination ? "openai" : "mock",
      destination: destination ?? "未設定",
    });
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return reply(405, { error: "送信方法を確認してください。" });
  }
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host)
        return reply(403, { error: "このサイトから送信してください。" });
    } catch {
      return reply(403, { error: "送信元を確認してください。" });
    }
  }
  if (!req.headers["content-type"]?.startsWith("application/json"))
    return reply(415, { error: "JSON で送信してください。" });
  let op;
  try {
    op = parseOperation(await readBody(req));
  } catch {
    return reply(400, {
      error: "入力を確認してください。経過は12,000文字、回答は5件までです。",
    });
  }
  const real = process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "mock";
  if (real && !rateConfigured)
    return reply(503, {
      error: "回数制限のサーバー設定が必要です。鍵なしで試すこともできます。",
    });
  const confirmedDestination = req.headers["x-ayumi-destination"];
  if (
    (real || confirmedDestination !== undefined) &&
    (!destination || destination !== confirmedDestination)
  )
    return reply(409, {
      error: "AI の送り先を確認し直してください。入力は残っています。",
    });
  const rate = rateTicket(
    req.headers.cookie,
    secret || "local-mock-no-paid-ai",
    Math.min(30, Math.max(1, Number(process.env.RATE_LIMIT_MAX) || 8)),
  );
  res.setHeader(
    "Set-Cookie",
    rate.cookie + (process.env.VERCEL ? "; Secure" : ""),
  );
  const ip = process.env.VERCEL
    ? String(req.headers["x-forwarded-for"] || "unknown")
        .split(",")[0]
        .trim()
    : req.socket.remoteAddress || "unknown";
  const hash = createHmac("sha256", secret || "mock")
    .update(ip)
    .digest("hex");
  if (
    !rate.allowed ||
    (real &&
      !ipTicket(
        hash,
        Math.min(600, Math.max(1, Number(process.env.IP_RATE_MAX) || 60)),
      ))
  )
    return limited(real ? 600 : rate.retryAfter);
  try {
    const maximum = Math.min(
      600,
      Math.max(1, Math.floor(Number(process.env.AI_CALL_RATE_MAX) || 80)),
    );
    const provider = real
      ? createProvider(process.env, (...args) => {
          // 再検査も含め、提供元に送る各呼び出しを窓内の合計に数える。
          countPaidCall(maximum);
          return fetch(...args);
        })
      : createProvider();
    return reply(200, await runOperation(op, provider));
  } catch (error) {
    if (error instanceof PaidCallLimit) return limited(error.retryAfter);
    return reply(502, {
      error:
        "AI の整理を確認できませんでした。入力は残っています。文を短くするか、鍵なしで試してください。",
    });
  }
}
