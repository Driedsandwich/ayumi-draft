import { parseOutput } from "./schema";
import type { Operation, Provider, Extraction, Patch } from "./types";
export async function runOperation(
  op: Operation,
  provider: Provider,
): Promise<{ data: Extraction | Patch[]; calls: number; provider: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.complete(op, attempt === 1); // Transport errors do not trigger hidden retries.
    try {
      return {
        data: parseOutput(raw, op),
        calls: provider.name === "mock" ? 0 : attempt + 1,
        provider: provider.name,
      };
    } catch {
      if (attempt === 1)
        throw Error(
          "引用または JSON を確認できませんでした。入力は残っています。文を短くしてお試しください。",
        );
    }
  }
  throw Error("整理できませんでした。");
}
