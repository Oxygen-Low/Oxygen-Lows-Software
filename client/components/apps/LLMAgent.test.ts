import { describe, it, expect } from "vitest";
import {
  extractToolCallsFromContent,
  parseJsonSafely,
} from "./LLMAgent";

describe("LLMAgent tool call parser", () => {
  const mockTools = [
    { function: { name: "read_file" } },
    { function: { name: "write_file" } },
    { function: { name: "edit_file" } },
    { function: { name: "run_command" } },
    { function: { name: "list_directory" } },
    { function: { name: "search_files" } },
  ];

  it("parses unclosed <tool_call> with commands array (user prompt scenario)", () => {
    const input = `<tool_call> { "commands": [ { "command": "write_file", "arguments": { "path": "hello.py", "content": "print(\\"Hello World!\\")\\n" } } ] }`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("write_file");
    const args = JSON.parse(result.toolCalls[0].arguments);
    expect(args.path).toBe("hello.py");
    expect(args.content).toBe('print("Hello World!")\n');
    expect(result.cleanedContent).toBe("");
  });

  it("parses closed <tool_call> with single tool call", () => {
    const input = `I am going to read the file now.\n<tool_call>{"name": "read_file", "arguments": {"path": "src/main.ts"}}</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("read_file");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({ path: "src/main.ts" });
    expect(result.cleanedContent).toBe("I am going to read the file now.");
  });

  it("parses closed <tool_call> with 'args' instead of 'arguments'", () => {
    const input = `<tool_call>{"name": "list_directory", "args": {"path": "."}}</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("list_directory");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({ path: "." });
  });

  it("parses markdown json code block with commands array", () => {
    const input = `Here is the plan.
\`\`\`json
{
  "reasoning": "Need to run test suite",
  "commands": [
    { "command": "run_command", "arguments": { "command": "npm test" } }
  ]
}
\`\`\``;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("run_command");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({ command: "npm test" });
    expect(result.reasoning).toBe("Need to run test suite");
    expect(result.cleanedContent).toBe("Here is the plan.");
  });

  it("parses multiple commands in commands array", () => {
    const input = `<tool_call>{
      "commands": [
        { "command": "read_file", "arguments": { "path": "package.json" } },
        { "command": "run_command", "arguments": { "command": "pnpm build" } }
      ]
    }</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].name).toBe("read_file");
    expect(result.toolCalls[1].name).toBe("run_command");
  });

  it("handles JSON with trailing commas safely", () => {
    const parsed = parseJsonSafely('{"command": "write_file", "arguments": {"path": "a.txt",},}');
    expect(parsed).toEqual({ command: "write_file", arguments: { path: "a.txt" } });
  });

  it("handles malformed or non-string inputs safely in parseJsonSafely", () => {
    expect(parseJsonSafely("")).toBeNull();
    expect(parseJsonSafely(null as any)).toBeNull();
    expect(parseJsonSafely("invalid json here")).toBeNull();
  });
});
