import { describe, expect, it, vi } from "vitest";
import { fresh, restore, storageKey, type State } from "../src/client/storage";
import { mockExtract } from "../src/core/mock";

function readLegacy(state: Partial<State>) {
  const old: Partial<State> & { extractionSourceCount?: number } = {
    ...fresh(),
    ...state,
  };
  delete old.extractionSourceCount;
  const getItem = vi.fn(() => JSON.stringify(old));
  vi.stubGlobal("localStorage", { getItem });
  try {
    const restored = restore();
    expect(getItem).toHaveBeenCalledWith(storageKey);
    expect(restored.error).toBe("");
    return restored.state;
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("保存された下書き", () => {
  it("復元する下書きでも受診の根拠がない引用は未確認にする", () => {
    const text = "通勤に時間がかかった。";
    const { events } = mockExtract(text);
    events[0].care = { value: "yes", quote: text };
    expect(
      readLegacy({ text, events, sources: [text] }).events[0].care.value,
    ).toBe("unknown");
  });
  it("以前の保存から現在の回答の引用だけを引き継ぐ", () => {
    const text = "北医院に通院した。";
    const { events } = mockExtract(text);
    const oldAnswer = "掃除は家族に頼んだ";
    const currentAnswer = "衣服の用意を頼んだ";
    events[0].daily = { value: currentAnswer, quote: currentAnswer };
    const state = readLegacy({
      text,
      events,
      sources: [text, oldAnswer, currentAnswer],
    });
    expect(state.sources).toEqual([text, currentAnswer]);
    expect(state.events[0].daily.value).toBe(currentAnswer);
  });
});
