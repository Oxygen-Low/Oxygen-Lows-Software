import React, { useMemo } from "react";
import Prism from "prismjs";

// Import commonly used language grammars
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-graphql";

// Language alias mapping
const LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  html: "markup",
  xml: "markup",
  svg: "markup",
  yml: "yaml",
  md: "markdown",
  golang: "go",
  rs: "rust",
  cs: "csharp",
};

export interface CodeHighlighterProps
  extends React.HTMLAttributes<HTMLPreElement> {
  language?: string;
  children?: React.ReactNode;
  code?: string;
  customStyle?: React.CSSProperties;
  style?: any; // For backward compatibility with react-syntax-highlighter
  PreTag?: any;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const CodeHighlighter: React.FC<CodeHighlighterProps> = ({
  language = "plaintext",
  children,
  code,
  className = "",
  customStyle,
  style: _style,
  PreTag = "pre",
  ...rest
}) => {
  const rawCode = (
    code !== undefined ? code : typeof children === "string" ? children : ""
  ).replace(/\n$/, "");

  const normalizedLang = (language || "").toLowerCase().trim();
  const canonicalLang = LANGUAGE_MAP[normalizedLang] || normalizedLang;

  const highlightedHtml = useMemo(() => {
    if (!rawCode) return "";

    const grammar = Prism.languages[canonicalLang];
    if (grammar) {
      try {
        return Prism.highlight(rawCode, grammar, canonicalLang);
      } catch {
        return escapeHtml(rawCode);
      }
    }
    return escapeHtml(rawCode);
  }, [rawCode, canonicalLang]);

  const Tag = PreTag || "pre";

  return (
    <Tag
      className={`font-mono text-sm leading-relaxed overflow-x-auto text-slate-100 bg-[#1e1e1e] p-4 rounded-lg border border-slate-800/80 code-highlighter-root ${className}`}
      style={customStyle}
      {...rest}
    >
      <code
        className={`language-${canonicalLang} font-mono`}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    </Tag>
  );
};

export default CodeHighlighter;
