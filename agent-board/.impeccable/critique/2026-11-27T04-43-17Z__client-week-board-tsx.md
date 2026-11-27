---
target: Agent Board week board
total_score: 30
p0_count: 0
p1_count: 0
timestamp: 2026-11-27T04-43-17Z
slug: client-week-board-tsx
---
# Critique: Agent Board week board (client/week-board.tsx)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Running pulse + elapsed, Finished chips, offline warning, per-day done tallies |
| 2 | Match System / Real World | 4 | Backlog + day columns + struck-through done foot matches the paper journal metaphor |
| 3 | User Control and Freedom | 4 | Undo bar, tap-to-place, multi-select, keyboard slides, collapsible rail and sections |
| 4 | Consistency and Standards | 3 | Header padding/gap was inconsistent across the row (fixed); otherwise a tight token vocabulary |
| 5 | Error Prevention | 3 | Two-tap stop, archive undo, no accidental drags (tap-to-place instead) |
| 6 | Recognition Rather Than Recall | 3 | Empty state teaches the gesture; the grip is hover-only and long-press is invisible until discovered |
| 7 | Flexibility and Efficiency | 4 | Keyboard slides, multi-select, MoveBar, week navigation with counts, collapsible rail |
| 8 | Aesthetic and Minimalist Design | 3 | Quiet and dense; empty columns are honest but sparse on short weeks |
| 9 | Error Recovery | 3 | Archive undo, dismissible gates, save-error surfacing |
| 10 | Help and Documentation | 2 | Only the empty state and the armed MoveBar hint; no persistent shortcut reference |
| **Total** | | **30/40** | **Solid** |

## Anti-Patterns Verdict

**LLM assessment**: Not AI slop. The board has a clear point of view (quiet kanban, capture-first, today emphasized) rather than a generic dashboard grid. The spacing is mostly rhythmic, the color vocabulary is restrained (host tokens), and the empty state now teaches instead of just labeling. The biggest tell of care: the slim weekend columns and the per-day done foot, which are deliberate choices, not template defaults.

**Deterministic scan**: `detect.mjs --fast client/` returned zero findings.

## Overall Impression

A working, opinionated week board that already feels like a tool rather than a mockup. The two real gaps were accessibility of placement (drop zones hidden from screen readers) and a text-only empty state; both are fixed in this pass. The remaining work is discoverability polish: the grip and the keyboard model are still invisible until the user stumbles on them.

## What's Working

- **The week topology reads instantly**: Backlog on the left, today underlined, weekends slim until occupied. The glance lands on today without a color wash.
- **The done foot per day column** gives a quiet sense of completion without a separate "Done" view or a nag.
- **The rail's collapse model** (whole column to a strip, sections to labels-with-counts) lets the user reclaim space without losing the running count.

## Priority Issues

- **[P2] Drop zones were hidden from screen readers** — the column body was `accessibilityElementsHidden`, so a screen-reader user could not place a card on a specific day. **Fixed**: while a card is in hand the surface is now named ("Place card on Tue Nov 24") and exposed.
- **[P2] Empty state was text-only** — a title, a sentence, and two buttons in a blank window. **Fixed**: a small three-box diagram shows the card leaving the Backlog and landing on Today.
- **[P3] Collapse chevrons are small and low-contrast** — the rail collapse and section chevrons are 12–14px in `foregroundMuted`. Consider a slightly larger hit area or a hover treatment so they read as controls.
- **[P3] No persistent keyboard shortcut reference** — the arrow-key model only appears in the MoveBar hint while a card is armed. A first-run hint or a small "?" affordance would close the gap.
- **[P3] Empty state offers only Jira** — the "Add from Jira" CTA is the only tracker button; the dock covers the others, but the first-run path could name all three channels.

## Persona Red Flags

**Alex (Power User)**: Well served — keyboard slides, multi-select, week navigation with counts. Red flag: the arrow-key model is only documented inside the armed state, so discovery depends on reading the MoveBar once.

**Jordan (First-Timer)**: The empty state now shows the gesture, and capture lands in the Backlog with no decisions required. Red flag: after the first card exists, there is no persistent hint that long-press or the hover grip starts a move; the "Backlog N parked" label also assumes the parking metaphor is obvious.

**Morgan (Screen Reader)**: Before this pass, placement on a specific day was impossible (drop zones hidden). Now named and exposed while armed. Red flag remaining: the drop zones leave the tab order (`tabIndex={-1}`), so keyboard-only placement still depends on the MoveBar buttons rather than tabbing to a column.

## Minor Observations

- The rail section spacer is a fixed 14px view; it works but could be a gap token.
- The stacked ColumnHeading's vertical padding now matches the grid header (8/4).
- "Backlog N parked" is charming but slightly jargon-y; keep unless users trip on it.

## Questions to Consider

- Would a one-time first-run tooltip on the first card ("Long-press or hover the grip to move me") be worth the interruption?
- Should the empty state's tracker CTA name all three channels, or is the dock enough?
- Is the collapsed rail's 36px strip too narrow to be a useful running indicator, or is the expand chevron enough?
