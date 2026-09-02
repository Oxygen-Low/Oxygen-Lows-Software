const BROWSER_HEADERS = { "User-Agent": "Mozilla/5.0" };
const maxChars = 1000;

function stripHtmlTags(html: string) {
  return html.replace(/<[^>]*>?/gm, "");
}

async function sequential(cleanUrl: string) {
  const start = performance.now();
  const u = new URL(cleanUrl);
  const title = u.pathname.split("/wiki/")[1];
  const apiEndpoints = [
    `${u.origin}/w/api.php?action=query&format=json&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&origin=*`,
    `${u.origin}/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`,
    `${u.origin}/api.php?action=query&format=json&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&origin=*`,
    `${u.origin}/w/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`,
  ];

  for (const endpoint of apiEndpoints) {
    try {
      const apiRes = await fetch(endpoint, {
        headers: {
          "User-Agent": BROWSER_HEADERS["User-Agent"],
          Accept: "application/json,text/html,*/*",
        },
        signal: AbortSignal.timeout(4000),
      });
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data?.parse?.text?.["*"]) {
          const parsedText = stripHtmlTags(data.parse.text["*"]);
          if (parsedText.length > 50) return { time: performance.now() - start, text: parsedText.substring(0, maxChars) };
        }
        const pages = data?.query?.pages || {};
        for (const k in pages) {
          if (pages[k]?.extract) {
            return { time: performance.now() - start, text: stripHtmlTags(pages[k].extract).substring(0, maxChars) };
          }
        }
      }
    } catch {}
  }
  return { time: performance.now() - start, text: null };
}

async function concurrent(cleanUrl: string) {
  const start = performance.now();
  const u = new URL(cleanUrl);
  const title = u.pathname.split("/wiki/")[1];
  const apiEndpoints = [
    `${u.origin}/w/api.php?action=query&format=json&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&origin=*`,
    `${u.origin}/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`,
    `${u.origin}/api.php?action=query&format=json&prop=extracts&explaintext=1&titles=${encodeURIComponent(title)}&origin=*`,
    `${u.origin}/w/api.php?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text&origin=*`,
  ];

  try {
    const text = await Promise.any(
      apiEndpoints.map(async (endpoint) => {
        const apiRes = await fetch(endpoint, {
          headers: {
            "User-Agent": BROWSER_HEADERS["User-Agent"],
            Accept: "application/json,text/html,*/*",
          },
          signal: AbortSignal.timeout(4000),
        });
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data?.parse?.text?.["*"]) {
            const parsedText = stripHtmlTags(data.parse.text["*"]);
            if (parsedText.length > 50) return parsedText.substring(0, maxChars);
          }
          const pages = data?.query?.pages || {};
          for (const k in pages) {
            if (pages[k]?.extract) {
              return stripHtmlTags(pages[k].extract).substring(0, maxChars);
            }
          }
        }
        throw new Error("No text found");
      })
    );
    return { time: performance.now() - start, text };
  } catch {
    return { time: performance.now() - start, text: null };
  }
}

async function run() {
  const url = "https://wiki.archlinux.org/title/Arch_Linux";
  // The first endpoint usually fails for custom wikis, testing a failure scenario
  console.log("Sequential:");
  console.log((await sequential(url)).time);
  console.log("Concurrent:");
  console.log((await concurrent(url)).time);
}

run();
