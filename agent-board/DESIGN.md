# DESIGN.md — Agent Board

The host supplies the theme (14 tokens); the plugin colors everything from `theme.colors`. No hardcoded hex in UI code.

## Color Tokens

- `surface0`: page background.
- `surface1`: card background, raised surfaces.
- `surface2`: in-hand/selected card background, secondary buttons.
- `foreground`: primary text, today's header tint.
- `foregroundMuted`: meta text, quiet labels, dates, counts.
- `border`: hairlines, card outlines, column rules.
- `accent`: interactive emphasis, today's underline, selected state.
- `accentForeground`: text on accent.
- `statusSuccess`: done checks, CI pass.
- `statusWarning`: changes requested, offline note.
- `statusDanger`: CI fail, stop/dismiss.

## Typography

- Card title: 13px (dense) / 14px, weight 500, foreground.
- Meta line: 10–12px, foregroundMuted, mono for tracker keys.
- Section label: 11px, weight 600, letterSpacing 0.4, foregroundMuted.
- Column header: 11px, weight 600, letterSpacing 0.3, today uses foreground.
- Chips: 10–11px, weight 600.

## Spacing Scale

- 4px: icon/text gaps inside a row, card padding (dense).
- 8px: card padding, chip padding, row gaps.
- 10–12px: column header padding, section padding.
- 14px: space between rail sections.
- 24px: empty-state padding.

## Components

- **CardRow**: border 1px, radius 8 (dense) / 10, surface1; in-hand = surface2 + accent border.
- **Column**: equal-width days, minimum 280px. Three fill a typical viewport, four when each can be at least 300px; horizontal navigation reveals the rest.
- **Header**: fixed height, bottom border 1px (today 2px accent), text bottom-aligned. No vertical day dividers; card spacing carries separation. Single chevrons move a day, double chevrons move a week, and Today returns to the leftmost position.
- **Side panel**: 280–340px docked on desktop, one shared surface for Backlog or Agents. Compact layouts overlay it as a drawer.
- **Utility rail**: persistent 48px strip with labeled Backlog and Agents buttons, count badges, and official tracker brand SVGs themed with `currentColor`.

## States

- Hover: card shows reorder grip (desktop), drop zone border turns accent.
- Selected: accent border + select circle filled.
- Done: struck-through, muted, in the day's foot.
- Empty: EmptyBoard replaces the grid; a cleared day shows a quiet note.
