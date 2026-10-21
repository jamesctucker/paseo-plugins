import { afterEach, describe, expect, it } from "vitest";
import { agentRadarState, forgetAgent, patchAgentState, resetRadar } from "../client/store";

afterEach(() => {
  resetRadar();
});

describe("patchAgentState windingDown", () => {
  it("stores the winding-down signal with the classification result", () => {
    patchAgentState("a1", { status: "ready", matches: [{ name: "session-handoff", confidence: 88 }], reason: null, windingDown: 88 });
    expect(agentRadarState("a1").windingDown).toBe(88);
  });

  it("preserves windingDown across patches that omit it", () => {
    // runClassify patches analyzing state between results; the merge must not drop the signal.
    patchAgentState("a1", { status: "ready", matches: [], reason: null, windingDown: 72 });
    patchAgentState("a1", { status: "analyzing", matches: [], reason: null });
    expect(agentRadarState("a1").windingDown).toBe(72);
  });

  it("clears windingDown when a result carries null", () => {
    // A failed or unavailable classification must not leave the badge lit on a stale signal.
    patchAgentState("a1", { status: "ready", matches: [], reason: null, windingDown: 72 });
    patchAgentState("a1", { status: "unavailable", matches: [], reason: "request failed", windingDown: null });
    expect(agentRadarState("a1").windingDown).toBeNull();
  });

  it("forgets windingDown with the agent", () => {
    patchAgentState("a1", { status: "ready", matches: [], reason: null, windingDown: 72 });
    forgetAgent("a1");
    expect(agentRadarState("a1").windingDown).toBeNull();
  });
});
