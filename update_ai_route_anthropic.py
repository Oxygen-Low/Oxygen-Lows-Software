import sys

with open('server/routes/ai.ts', 'r') as f:
    content = f.read()

old_anthropic_start = '      case "anthropic": {'
new_anthropic = """      case "anthropic": {
        const s = processedMessages.find((m: any) => m.role === "system");
        const transformedMessages = processedMessages.filter((m: any) => m.role !== "system").map((m: any) => {
          if (Array.isArray(m.content)) {
            return {
              role: m.role,
              content: m.content.map((part: any) => {
                if (part.type === "text") return { type: "text", text: part.text };
                if (part.type === "image_url") {
                  const url = part.image_url.url || part.image_url;
                  const [header, base64Data] = url.split(",");
                  const mimeType = header.split(";")[0].split(":")[1] || "image/jpeg";
                  return {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: mimeType,
                      data: base64Data
                    }
                  };
                }
                return part;
              })
            };
          }
          return m;
        });
        handleResponse(await axios.post("https://api.anthropic.com/v1/messages", {
          model,
          messages: transformedMessages,
          max_tokens: 4096,
          stream,
          system: s?.content
        }, { ...axiosOptions, headers: { ...axiosOptions.headers, "x-api-key": integration?.api_key, "anthropic-version": "2023-06-01" } }));
        break;
      }"""

# This is a bit tricky to replace because of the block.
# Let's use a simpler marker if possible.
import re
pattern = r'      case "anthropic": \{.*?\n      \}'
content = re.sub(r'      case "anthropic": \{.*?\n      \}', new_anthropic, content, flags=re.DOTALL)

with open('server/routes/ai.ts', 'w') as f:
    f.write(content)
