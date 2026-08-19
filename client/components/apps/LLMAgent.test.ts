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

  it("parses user XML tool call format (<function=write_file> ...)", () => {
    const input = `<tool_call> <function=write_file> <parameter=path> hello.py </parameter> <parameter=content> print("Hello World!") </parameter> </function> </tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("write_file");
    const args = JSON.parse(result.toolCalls[0].arguments);
    expect(args.path).toBe("hello.py");
    expect(args.content).toBe('print("Hello World!")');
    expect(result.cleanedContent).toBe("");
  });

  it("parses multiline XML tool call and preserves code indentation", () => {
    const input = `I will write the script now.
<tool_call>
<function=write_file>
<parameter=path>scripts/main.py</parameter>
<parameter=content>
def add(a, b):
    return a + b

if __name__ == "__main__":
    print(add(2, 3))
</parameter>
</function>
</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("write_file");
    const args = JSON.parse(result.toolCalls[0].arguments);
    expect(args.path).toBe("scripts/main.py");
    expect(args.content).toBe(
      'def add(a, b):\n    return a + b\n\nif __name__ == "__main__":\n    print(add(2, 3))',
    );
    expect(result.cleanedContent).toBe("I will write the script now.");
  });

  it("parses XML format with function name and parameter attributes", () => {
    const input = `<tool_call>
<function name="write_file">
<parameter name="path">app.js</parameter>
<parameter name="content">console.log("ok");</parameter>
</function>
</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("write_file");
    const args = JSON.parse(result.toolCalls[0].arguments);
    expect(args.path).toBe("app.js");
    expect(args.content).toBe('console.log("ok");');
  });

  it("parses multiple XML function calls in one <tool_call> block (e.g. write then run)", () => {
    const input = `<tool_call>
<function=write_file>
<parameter=path>hello.py</parameter>
<parameter=content>print("Hello World!")</parameter>
</function>
<function=run_command>
<parameter=command>python hello.py</parameter>
</function>
</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].name).toBe("write_file");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({
      path: "hello.py",
      content: 'print("Hello World!")',
    });
    expect(result.toolCalls[1].name).toBe("run_command");
    expect(JSON.parse(result.toolCalls[1].arguments)).toEqual({
      command: "python hello.py",
    });
  });

  it("parses Anthropic-style <function_calls><invoke name='...'> XML", () => {
    const input = `<function_calls>
<invoke name="read_file">
<parameter name="path">README.md</parameter>
</invoke>
</function_calls>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("read_file");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({
      path: "README.md",
    });
  });

  it("parses direct tool name XML tags", () => {
    const input = `<tool_call>
<write_file>
<path>test.txt</path>
<content>Hello</content>
</write_file>
</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("write_file");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({
      path: "test.txt",
      content: "Hello",
    });
  });

  it("parses Mistral [TOOL_CALLS] format", () => {
    const input = `[TOOL_CALLS] [{"name": "run_command", "arguments": {"command": "npm run build"}}]`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("run_command");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({
      command: "npm run build",
    });
  });

  it("extracts reasoning from <think> tags and cleans content", () => {
    const input = `<think>
I need to create hello.py and run it.
</think>
<tool_call>
<function=write_file>
<parameter=path>hello.py</parameter>
<parameter=content>print("Hello World!")</parameter>
</function>
</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.reasoning).toBe("I need to create hello.py and run it.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("write_file");
    expect(result.cleanedContent).toBe("");
  });

  it("normalizes parameter aliases (file -> path, code -> content, cmd -> command)", () => {
    const input = `<tool_call>
<function=write_file>
<parameter=file>hello.py</parameter>
<parameter=code>print("Hello World!")</parameter>
</function>
</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    const args = JSON.parse(result.toolCalls[0].arguments);
    expect(args.path).toBe("hello.py");
    expect(args.content).toBe('print("Hello World!")');
  });

  it("strips accidental markdown fences inside code file content", () => {
    const input = `<tool_call>
<function=write_file>
<parameter=path>hello.py</parameter>
<parameter=content>
\`\`\`python
print("Hello World!")
\`\`\`
</parameter>
</function>
</tool_call>`;
    const result = extractToolCallsFromContent(input, mockTools);

    expect(result.toolCalls).toHaveLength(1);
    const args = JSON.parse(result.toolCalls[0].arguments);
    expect(args.path).toBe("hello.py");
    expect(args.content).toBe('print("Hello World!")');
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
