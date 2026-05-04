import { describe, it, expect } from "vitest";
import { smokeGraph } from "../_smoke.js";

describe("smokeGraph — Hello World 2-node StateGraph", () => {
  it("spec acceptance: invoke({ greeting: '' }) → 'Hello, Eatit!'", async () => {
    const output = await smokeGraph.invoke({ greeting: "" });
    expect(output.greeting).toBe("Hello, Eatit!");
  });

  it("initial state value is overwritten by node 'a'", async () => {
    const output = await smokeGraph.invoke({ greeting: "ignored" });
    expect(output.greeting).toBe("Hello, Eatit!");
  });

  it("streaming API yields intermediate states per node", async () => {
    const chunks: { greeting: string }[] = [];
    // stream() returns a Promise<AsyncIterable> in LangGraph.js 0.2.x
    for await (const chunk of await smokeGraph.stream({ greeting: "" })) {
      if (typeof chunk === "object" && chunk !== null) {
        for (const value of Object.values(chunk)) {
          if (
            typeof value === "object" &&
            value !== null &&
            "greeting" in value
          ) {
            chunks.push(value as { greeting: string });
          }
        }
      }
    }
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].greeting).toBe("Hello");
    expect(chunks[chunks.length - 1].greeting).toBe("Hello, Eatit!");
  });

  it("output.greeting is typed as string (compile-time narrowing)", async () => {
    const output = await smokeGraph.invoke({ greeting: "" });
    const greeting: string = output.greeting;
    expect(typeof greeting).toBe("string");
  });
});
