import { describe, expect, it } from "vitest";
import {
  parseDelimitedText,
  parseModelScopeFile,
  pickModelScopeDataFile,
} from "./datasets.ts";

describe("ModelScope dataset import helpers", () => {
  it("parses CSV with quoted fields and embedded newlines", () => {
    const rows = parseDelimitedText(
      'instruction,input,output\n"Say ""hi""",,"Hello, world!"\nLine 1,,Line 2\nMulti,,"Line 1\nLine 2"\n',
      ",",
    );

    expect(rows).toEqual([
      { instruction: 'Say "hi"', input: "", output: "Hello, world!" },
      { instruction: "Line 1", input: "", output: "Line 2" },
      { instruction: "Multi", input: "", output: "Line 1\nLine 2" },
    ]);
  });

  it("parses JSONL files and skips malformed lines", async () => {
    const items = await parseModelScopeFile(
      Buffer.from(
        '{"instruction":"a","output":"b"}\nnot json\n{"instruction":"c","output":"d"}\n',
      ),
      "train.jsonl",
    );

    expect(items).toEqual([
      { instruction: "a", output: "b" },
      { instruction: "c", output: "d" },
    ]);
  });

  it("parses JSON arrays", async () => {
    const items = await parseModelScopeFile(
      Buffer.from('[{"instruction":"a","output":"b"}]'),
      "train.json",
    );

    expect(items).toEqual([{ instruction: "a", output: "b" }]);
  });

  it("picks the train data file and ignores metadata files", () => {
    const files = [
      { Name: "README.md", Path: "README.md", Type: "blob", Size: 100 },
      {
        Name: "dataset_infos.json",
        Path: "dataset_infos.json",
        Type: "blob",
        Size: 100,
      },
      { Name: "test.json", Path: "test.json", Type: "blob", Size: 100 },
      { Name: "train.csv", Path: "train.csv", Type: "blob", Size: 100 },
    ];

    expect(pickModelScopeDataFile(files)?.Path).toBe("train.csv");
  });

  it("honors an explicitly requested file path", () => {
    const files = [
      { Name: "train.csv", Path: "train.csv", Type: "blob", Size: 100 },
      { Name: "test.json", Path: "test.json", Type: "blob", Size: 100 },
    ];

    expect(pickModelScopeDataFile(files, "test.json")?.Path).toBe("test.json");
    expect(pickModelScopeDataFile(files, "missing.json")).toBeNull();
  });
});
