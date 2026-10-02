import Prism from "prismjs";

// Ensure Prism is globally available across window and globalThis before loading components
if (typeof window !== "undefined") {
  (window as any).Prism = Prism;
}
if (typeof globalThis !== "undefined") {
  (globalThis as any).Prism = Prism;
}

// Import base grammars in topological dependency order
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-markup";
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

export { Prism };
export default Prism;
