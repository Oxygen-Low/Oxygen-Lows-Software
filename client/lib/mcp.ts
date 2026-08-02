import { supabase } from "./supabase";

export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPServer {
  id: string;
  name: string;
  tools: MCPTool[];
  execute: (toolName: string, args: Record<string, any>) => Promise<string>;
}

export const builtinFetchServer: MCPServer = {
  id: "builtin-fetch",
  name: "Fetch (Built-in)",
  tools: [
    {
      name: "fetch_url",
      description: "Fetches content from a URL via HTTP GET",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch" },
        },
        required: ["url"],
      },
    },
  ],
  execute: async (toolName, args) => {
    if (toolName === "fetch_url") {
      try {
        // Route fetch through our backend proxy to avoid CORS and adblocker issues
        const response = await fetch("/api/proxy/fetch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ url: args.url })
        });
        if (!response.ok) {
           const errText = await response.text();
           return `Error: HTTP ${response.status} ${response.statusText}\n${errText}`;
        }
        const text = await response.text();
        return text.substring(0, 10000); // Limit size
      } catch (e: any) {
        return `Fetch error: ${e.message}`;
      }
    }
    throw new Error("Unknown tool");
  },
};

export const loadMCPServerFromString = (id: string, name: string, code: string): MCPServer => {
  try {
    // Provide a safe-ish context for eval, though it's client-side so user has control.
    // The code should end with: return { tools: [...], execute: async (...) => {...} }
    const fn = new Function(code);
    const serverObj = fn();
    return {
      id,
      name,
      tools: serverObj.tools || [],
      execute: serverObj.execute || (async () => "Not implemented"),
    };
  } catch (error) {
    console.error("Failed to load MCP server:", id, error);
    throw error;
  }
};

export const fetchAllMCPServers = async (userId: string): Promise<MCPServer[]> => {
  const servers: MCPServer[] = [builtinFetchServer];

  try {
    const { data, error } = await supabase.storage.from("Storage").list(userId);
    if (error) throw error;

    const mcpFiles = (data || []).filter((f) => f.name.endsWith(".mcp.js"));

    for (const file of mcpFiles) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("Storage")
        .download(`${userId}/${file.name}`);

      if (!downloadError && fileData) {
        const code = await fileData.text();
        try {
          const server = loadMCPServerFromString(
            file.name,
            file.name.replace(".mcp.js", ""),
            code,
          );
          servers.push(server);
        } catch (e) {
          console.error("Failed to parse MCP server", file.name, e);
        }
      }
    }
  } catch (e) {
    console.error("Error fetching MCP servers from storage", e);
  }

  return servers;
};
