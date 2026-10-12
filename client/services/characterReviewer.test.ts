import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewCharacter } from "./characterReviewer";

vi.mock("@/lib/db", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "test-session" } },
      })),
    },
  },
}));

const review = {
  summary: "A strong starting point.",
  strengths: ["Clear motivation."],
  improvements: {
    story: "Show the turning point.",
    appearance: "Add a distinctive detail.",
    personality: "Show a flaw.",
    consistency: "Explain the conflicting allegiances.",
  },
};
const options = {
  character: {
    name: "Mira",
    backstory: "A former guard.",
    appearance: "Blue cloak.",
    personality: "Loyal.",
    hidden_description: "Secret rebel.",
  },
  model: { provider: "horde", model_id: "Writing" },
  language: "Spanish",
};

afterEach(() => vi.unstubAllGlobals());

describe("reviewCharacter", () => {
  it("sends saved writing and context to the selected model with auth and language, without mutations or metadata", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "```json\n" + JSON.stringify(review) + "\n```",
                },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const character = {
      ...options.character,
      user_id: "private-owner",
      image_url: "private-url",
    };
    const before = JSON.stringify(character);
    const controller = new AbortController();
    expect(
      await reviewCharacter({
        ...options,
        character,
        model: { provider: "openrouter", model_id: "chosen-model" },
        apiKey: "test-key",
        universe: { name: "Moon City" },
        race: { name: "Elves" },
        signal: controller.signal,
      }),
    ).toEqual(review);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = (
      fetchMock.mock.calls as unknown as [string, RequestInit][]
    )[0];
    expect(url).toBe("/api/ai/proxy");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-session",
    });
    expect(init.signal).toBe(controller.signal);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      provider: "openrouter",
      model: "chosen-model",
      apiKey: "test-key",
    });
    expect(body.messages[0].content).toContain("Spanish");
    expect(JSON.parse(body.messages[1].content)).toEqual({
      character: options.character,
      universe: { name: "Moon City" },
      race: { name: "Elves" },
    });
    expect(JSON.stringify(character)).toBe(before);
  });

  it("sends universe-specific review prompts and payload when entityType is universe", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "```json\n" + JSON.stringify(review) + "\n```",
                },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const universe = {
      name: "Eldoria",
      short_description: "A high-magic floating continent.",
      appearance: "Crystalline towers and floating isles.",
      personality: "Ancient, serene, and precarious.",
      backstory: "Formed after the Sundering.",
      hidden_description: "The core is cracking.",
    };

    const res = await reviewCharacter({
      ...options,
      character: universe,
      entityType: "universe",
    });

    expect(res).toEqual(review);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = (
      fetchMock.mock.calls as unknown as [string, RequestInit][]
    )[0];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toContain(
      "worldbuilding and universe editor",
    );
    expect(JSON.parse(body.messages[1].content)).toEqual({
      universe: {
        name: "Eldoria",
        display_name: undefined,
        short_description: "A high-magic floating continent.",
        appearance: "Crystalline towers and floating isles.",
        personality: "Ancient, serene, and precarious.",
        backstory: "Formed after the Sundering.",
        hidden_description: "The core is cracking.",
      },
    });
  });

  it("sends race-specific review prompts and payload with linked universe when entityType is race", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "```json\n" + JSON.stringify(review) + "\n```",
                },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const race = {
      name: "Starborn",
      short_description: "Humanoids infused with stellar energy.",
      appearance: "Luminescent skin and silver hair.",
      personality: "Philosophical, aloof, and curious.",
      backstory: "Descended from astral travelers.",
      hidden_description: "Vulnerable to void decay.",
    };
    const universe = {
      name: "Cosmic Realm",
      short_description: "Interstellar empires.",
    };

    const res = await reviewCharacter({
      ...options,
      character: race,
      universe,
      entityType: "race",
    });

    expect(res).toEqual(review);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = (
      fetchMock.mock.calls as unknown as [string, RequestInit][]
    )[0];
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toContain(
      "race/species design editor",
    );
    expect(JSON.parse(body.messages[1].content)).toEqual({
      race: {
        name: "Starborn",
        display_name: undefined,
        short_description: "Humanoids infused with stellar energy.",
        appearance: "Luminescent skin and silver hair.",
        personality: "Philosophical, aloof, and curious.",
        backstory: "Descended from astral travelers.",
        hidden_description: "Vulnerable to void decay.",
      },
      universe: {
        name: "Cosmic Realm",
        display_name: undefined,
        short_description: "Interstellar empires.",
        appearance: undefined,
        personality: undefined,
        backstory: undefined,
        hidden_description: undefined,
      },
    });
  });

  it.each([
    "",
    "No review",
    '{"summary":"Incomplete"}',
    JSON.stringify({
      ...review,
      improvements: { ...review.improvements, story: [] },
    }),
  ])("rejects unusable feedback: %s", async (content) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: content }))),
    );
    await expect(reviewCharacter(options)).rejects.toThrow();
  });

  it("propagates provider failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Unavailable" }), {
            status: 503,
          }),
      ),
    );
    await expect(reviewCharacter(options)).rejects.toThrow("Unavailable");
  });

  it("does not start an aborted request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      reviewCharacter({ ...options, signal: controller.signal }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
