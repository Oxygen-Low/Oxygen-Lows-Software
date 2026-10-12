/** @vitest-environment jsdom */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { loadGrammars } from "@/lib/prism";
import { CodeHighlighter } from "./CodeHighlighter";

describe("CodeHighlighter", () => {
  // Vitest globals are disabled, so Testing Library cannot register auto-cleanup.
  afterEach(cleanup);

  it("renders code with Prism syntax highlighting", async () => {
    const code = `const greeting = "Hello, world!";`;
    const { container } = render(
      <CodeHighlighter language="typescript">{code}</CodeHighlighter>,
    );

    const preElement = container.querySelector("pre");
    expect(preElement).not.toBeNull();

    const codeElement = container.querySelector("code");
    expect(codeElement).not.toBeNull();
    expect(codeElement?.className).toContain("language-typescript");

    // Tokenized elements should exist after grammars load
    await waitFor(() => {
      const token = container.querySelector(".token");
      expect(token).not.toBeNull();
    });
  });

  it("handles plaintext or unknown languages safely", async () => {
    const raw = `<div>Hello & goodbye</div>`;
    // Wait for the grammar update even though plaintext does not gain tokens.
    await act(async () => {
      render(<CodeHighlighter language="unknownlang">{raw}</CodeHighlighter>);
      await loadGrammars();
    });

    const codeElement = document.querySelector("code");
    expect(codeElement?.textContent).toBe("<div>Hello & goodbye</div>");
  });

  it("handles code prop directly", async () => {
    const code = `function add(a: number, b: number) { return a + b; }`;
    const { container } = render(<CodeHighlighter language="ts" code={code} />);

    const codeElement = container.querySelector("code");
    expect(codeElement?.className).toContain("language-typescript");
    expect(codeElement?.textContent).toContain("add(a: number, b: number)");
    await waitFor(() => {
      expect(codeElement?.querySelector(".token")).not.toBeNull();
    });
  });

  it("supports PreTag override", async () => {
    const { container } = render(
      <CodeHighlighter language="json" PreTag="div">
        {`{"key": "value"}`}
      </CodeHighlighter>,
    );

    const divElement = container.querySelector("div.code-highlighter-root");
    expect(divElement).not.toBeNull();
    await waitFor(() => {
      expect(divElement?.querySelector(".token")).not.toBeNull();
    });
  });
});
