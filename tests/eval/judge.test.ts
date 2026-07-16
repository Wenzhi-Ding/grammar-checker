// tests/eval/judge.test.ts
import { describe, it, expect } from "vitest";
import { parseJudgeOutput } from "../../eval/judge";

describe("parseJudgeOutput", () => {
  it("parses a valid judge JSON payload", () => {
    const out = parseJudgeOutput('{"score":5.5,"strengths":["a"],"weaknesses":["b"],"missed":["c"]}');
    expect(out).toEqual({ score: 5.5, strengths: ["a"], weaknesses: ["b"], missed: ["c"] });
  });

  it("tolerates markdown fences and surrounding prose", () => {
    const out = parseJudgeOutput('Here you go:\n```json\n{"score":4,"strengths":[],"weaknesses":["w"],"missed":[]}\n```');
    expect(out.score).toBe(4);
    expect(out.weaknesses).toEqual(["w"]);
  });

  it("clamps the score to 0–7", () => {
    expect(parseJudgeOutput('{"score":9}').score).toBe(7);
    expect(parseJudgeOutput('{"score":-2}').score).toBe(0);
  });

  it("defaults missing arrays and non-numeric score", () => {
    const out = parseJudgeOutput('{"score":"high"}');
    expect(out.score).toBeNull();
    expect(out.strengths).toEqual([]);
  });

  it("returns score null with raw text on garbage", () => {
    const out = parseJudgeOutput("not json at all");
    expect(out.score).toBeNull();
    expect(out.raw).toBe("not json at all");
  });
});
