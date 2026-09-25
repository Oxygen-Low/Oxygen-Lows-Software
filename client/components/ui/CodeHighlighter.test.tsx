/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CodeHighlighter } from "./CodeHighlighter";

describe("CodeHighlighter", () => {
  it("renders code with Prism syntax highlighting", () => {
    const code = `const greeting = "Hello, world!";`;
    const { container } = render(
      <CodeHighlighter language="typescript">{code}</CodeHighlighter>,
    );

    const preElement = container.querySelector("pre");
    expect(preElement).not.toBeNull();

    const codeElement = container.querySelector("code");
    expect(codeElement).not.toBeNull();
    expect(codeElement?.className).toContain("language-typescript");

    // Tokenized elements should exist
    const token = container.querySelector(".token");
    expect(token).not.toBeNull();
  });

  it("handles plaintext or unknown languages safely", () => {
    const raw = `<div>Hello & goodbye</div>`;
    const { container } = render(
      <CodeHighlighter language="unknownlang">{raw}</CodeHighlighter>,
    );

    const codeElement = container.querySelector("code");
    expect(codeElement?.textContent).toBe("<div>Hello & goodbye</div>");
  });

  it("handles code prop directly", () => {
    const code = `function add(a: number, b: number) { return a + b; }`;
    const { container } = render(
      <CodeHighlighter language="ts" code={code} />,
    );

    const codeElement = container.querySelector("code");
    expect(codeElement?.className).toContain("language-typescript");
    expect(codeElement?.textContent).toContain("add(a: number, b: number)");
  });

  it("supports PreTag override", () => {
    const { container } = render(
      <CodeHighlighter language="json" PreTag="div">
        {`{"key": "value"}`}
      </CodeHighlighter>,
    );

    const divElement = container.querySelector("div.code-highlighter-root");
    expect(divElement).not.toBeNull();
  });
});
