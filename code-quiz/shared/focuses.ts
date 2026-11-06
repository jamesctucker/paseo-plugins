export interface FocusOption {
  id: string;
  label: string;
  /** Sent as the agent's topic, so write it as a teaching directive, not a UI label. */
  prompt: string;
}

// Onboarding angles that apply to any repo. Keep the list short: the screen
// shows them all as chips, and past four they stop being scanned and start
// being read.
export const DEFAULT_FOCUSES: FocusOption[] = [
  {
    id: "critical-paths",
    label: "Critical paths",
    prompt:
      "the most critical and frequently exercised parts of the application — the code a new engineer must understand first, and why it matters",
  },
  {
    id: "terminology",
    label: "Terminology & acronyms",
    prompt:
      "the domain terminology and acronyms used in this codebase — define each term and ground it in the files and symbols where it appears",
  },
  {
    id: "architecture",
    label: "Architecture",
    prompt:
      "the overall architecture — the major modules, what each one owns, and how they connect",
  },
  {
    id: "data-flow",
    label: "Data flow",
    prompt:
      "how data moves through the system end to end — the inputs, transformations, and outputs on the main path",
  },
];

// Repo-specific angles (a notable subsystem, a known-tricky module) belong here
// keyed by directory name under work/; they show up ahead of the defaults.
const FOCUS_EXTRAS: Record<string, FocusOption[]> = {};

export function getFocusesForRepo(repo: string | null): FocusOption[] {
  const extras = (repo && FOCUS_EXTRAS[repo]) || [];
  return [...extras, ...DEFAULT_FOCUSES];
}
