import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { Hono } from "hono";
import { datasetsRouter, convertRawItemsToDatasetRows } from "./datasets.ts";
import {
  DATASETS_STORAGE_DIR,
  getUserDatasetsSize,
  getUserTotalSize,
} from "../lib/storage.ts";

const TEST_USER_ID = "test-datasets-user-123";
const TEST_TOKEN = "valid-test-token-datasets";

vi.mock("../lib/auth.ts", () => ({
  resolveUserFromToken: vi.fn(async (token: string) => {
    if (token === TEST_TOKEN) {
      return { id: TEST_USER_ID, email: "test@example.com", username: "testuser" };
    }
    return null;
  }),
}));

describe("Datasets API Routes & Parquet Storage", () => {
  const app = new Hono();
  app.route("/api/datasets", datasetsRouter);

  const userDir = path.join(DATASETS_STORAGE_DIR, TEST_USER_ID);
  const metaFile = path.join(DATASETS_STORAGE_DIR, `${TEST_USER_ID}.json`);

  beforeEach(() => {
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
    }
    if (fs.existsSync(metaFile)) {
      fs.unlinkSync(metaFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
    }
    if (fs.existsSync(metaFile)) {
      fs.unlinkSync(metaFile);
    }
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.request("/api/datasets");
    expect(res.status).toBe(401);
  });

  it("saves, lists, reads rows, edits rows, downloads Parquet & JSONL, archives, unarchives, and deletes a standard dataset", async () => {
    const initialRows = [
      {
        instruction: "Explain recursion",
        input: "In Python",
        output: "A function that calls itself with a base case.",
      },
      {
        instruction: "What is 2 + 2?",
        input: "",
        output: "4",
      },
    ];

    // 1. Save dataset
    const saveRes = await app.request("/api/datasets/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Python Basics",
        description: "Test dataset for Python",
        rows: initialRows,
        model: "inclusionai/ling-3.1-flash",
        prompt: "Generate Python questions",
        datasetType: "standard",
      }),
    });

    expect(saveRes.status).toBe(200);
    const saveData = await saveRes.json();
    expect(saveData.success).toBe(true);
    const datasetId = saveData.datasetId || saveData.metadata.id;
    expect(datasetId).toBeDefined();
    expect(saveData.metadata.rowCount).toBe(2);
    expect(saveData.metadata.bytesOnDisk).toBeGreaterThan(0);

    // Verify storage quota includes dataset size
    const datasetsBytes = getUserDatasetsSize(TEST_USER_ID);
    expect(datasetsBytes).toBeGreaterThan(0);
    expect(getUserTotalSize(TEST_USER_ID)).toBeGreaterThanOrEqual(datasetsBytes);

    // 2. Duplicate active name returns 409
    const dupRes = await app.request("/api/datasets/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        name: "Python Basics",
        description: "Duplicate",
        rows: initialRows,
      }),
    });
    expect(dupRes.status).toBe(409);

    // 3. List datasets
    const listRes = await app.request("/api/datasets", {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.datasets).toHaveLength(1);
    expect(listData.datasets[0].id).toBe(datasetId);

    // 4. Read rows from Parquet
    const rowsRes = await app.request(`/api/datasets/${datasetId}/rows`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(rowsRes.status).toBe(200);
    const rowsData = await rowsRes.json();
    expect(rowsData.rows).toHaveLength(2);
    expect(rowsData.rows[0].instruction).toBe("Explain recursion");

    // 5. Update rows
    const updatedRows = [
      ...initialRows,
      {
        instruction: "What is a list comprehension?",
        input: "[x for x in range(5)]",
        output: "A concise way to create lists.",
      },
    ];
    const putRes = await app.request(`/api/datasets/${datasetId}/rows`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({ rows: updatedRows }),
    });
    expect(putRes.status).toBe(200);
    const putData = await putRes.json();
    expect(putData.metadata.rowCount).toBe(3);

    // 6. Download Parquet & JSONL via token query param
    const dlParquet = await app.request(
      `/api/datasets/${datasetId}/download?token=${TEST_TOKEN}`,
    );
    expect(dlParquet.status).toBe(200);
    const parquetBuf = Buffer.from(await dlParquet.arrayBuffer());
    expect(parquetBuf.subarray(0, 4).toString("ascii")).toBe("PAR1");

    const dlJsonl = await app.request(
      `/api/datasets/${datasetId}/download?format=jsonl&token=${TEST_TOKEN}`,
    );
    expect(dlJsonl.status).toBe(200);
    const jsonlText = await dlJsonl.text();
    expect(jsonlText.trim().split("\n")).toHaveLength(3);

    // 7. Archive & Unarchive
    const archiveRes = await app.request(`/api/datasets/${datasetId}/archive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(archiveRes.status).toBe(200);
    const archiveData = await archiveRes.json();
    expect(archiveData.metadata.archived).toBe(true);

    const unarchiveRes = await app.request(
      `/api/datasets/${datasetId}/unarchive`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      },
    );
    expect(unarchiveRes.status).toBe(200);
    const unarchiveData = await unarchiveRes.json();
    expect(unarchiveData.metadata.archived).toBe(false);

    // Verify rows survived archive/unarchive cycle
    const rowsAfterUnarchive = await app.request(
      `/api/datasets/${datasetId}/rows`,
      {
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      },
    );
    const rowsAfterData = await rowsAfterUnarchive.json();
    expect(rowsAfterData.rows).toHaveLength(3);

    // 8. Delete dataset
    const delRes = await app.request(`/api/datasets/${datasetId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(delRes.status).toBe(200);
    expect(getUserDatasetsSize(TEST_USER_ID)).toBe(0);
  });

  it("correctly maps HuggingFace raw items to dataset rows", () => {
    // 1. Alpaca style
    const alpaca = convertRawItemsToDatasetRows([
      { instruction: "Say hi", input: "", output: "Hello!" },
    ]);
    expect(alpaca.detectedType).toBe("standard");
    expect(alpaca.datasetType).toBe("standard");
    expect((alpaca.rows[0] as any).output).toBe("Hello!");

    // 2. DPO Post-Training style
    const dpo = convertRawItemsToDatasetRows([
      { prompt: "Write a poem", chosen: "Roses are red...", rejected: "No." },
    ]);
    expect(dpo.detectedType).toBe("post-training");
    expect(dpo.datasetType).toBe("post-training");
    expect((dpo.rows[0] as any).chosen).toBe("Roses are red...");

    // 3. Question/Answer style
    const qa = convertRawItemsToDatasetRows([
      { question: "Capital of France?", context: "Europe", answer: "Paris" },
    ]);
    expect(qa.detectedType).toBe("standard");
    expect(qa.datasetType).toBe("standard");
    expect((qa.rows[0] as any).instruction).toBe("Capital of France?");
    expect((qa.rows[0] as any).output).toBe("Paris");
  });

  it("generates dataset rows with contextLimit and prior entries anti-repetition memory", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    instruction: "Calculate derivative of x^2",
                    input: "with respect to x",
                    output: "2x",
                  },
                ]),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const genRes = await app.request("/api/datasets/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_TOKEN}`,
      },
      body: JSON.stringify({
        prompt: "Generate math calculus problems",
        model: "inclusionai/ling-3.1-flash",
        targetTokens: 1000,
        contextLimit: 5,
        existingRows: [
          { instruction: "What is 2 + 2?", input: "", output: "4" },
        ],
      }),
    });

    expect(genRes.status).toBe(200);
    const genData = await genRes.json();
    expect(genData.success).toBe(true);
    expect(genData.rows).toHaveLength(1);

    // Verify LLM request body included the anti-repetition requirement
    expect(fetchSpy).toHaveBeenCalled();
    const lastCallBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    const userPrompt = lastCallBody.messages[0].content;
    expect(userPrompt).toContain("CRITICAL ANTI-REPETITION REQUIREMENT");
    expect(userPrompt).toContain("What is 2 + 2?");
    fetchSpy.mockRestore();
  });
});
