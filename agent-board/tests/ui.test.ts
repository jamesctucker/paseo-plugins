import { describe, expect, it } from "vitest";
import { agentLabel } from "../shared/agent-label";

describe("agentLabel", () => {
  it("names attention states in human vocabulary", () => {
    expect(agentLabel({ status: "idle", attentionReason: "permission" })).toBe("Needs you");
    expect(agentLabel({ status: "error", attentionReason: "error" })).toBe("Errored");
    expect(agentLabel({ status: "idle", attentionReason: "finished" })).toBe("Finished");
  });

  it("names live and closed statuses without leaking raw enums", () => {
    expect(agentLabel({ status: "running", attentionReason: null })).toBe("Running");
    expect(agentLabel({ status: "initializing", attentionReason: null })).toBe("Running");
    expect(agentLabel({ status: "closed", attentionReason: null })).toBe("Agent closed");
  });
});
