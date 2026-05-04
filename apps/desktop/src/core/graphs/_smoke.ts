import { StateGraph, START, END } from "@langchain/langgraph";

interface SmokeState {
  greeting: string;
}

const graph = new StateGraph<SmokeState>({
  channels: { greeting: { value: (l, r) => r ?? l } },
})
  .addNode("a", async () => ({ greeting: "Hello" }))
  .addNode("b", async (s) => ({ greeting: `${s.greeting}, Eatit!` }))
  .addEdge(START, "a")
  .addEdge("a", "b")
  .addEdge("b", END)
  .compile();

export { graph as smokeGraph };
