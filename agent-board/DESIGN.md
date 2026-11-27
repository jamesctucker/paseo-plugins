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
- **Column**: day column width 112–260 (share), backlog 140–232, weekend slim 30.
- **Header**: fixed height, bottom border 1px (today 2px accent), text bottom-aligned.
- **Rail**: fixed width 240–340, collapses to 36px strip.
- **Dock**: 48px icon strip at the far right.

## States

- Hover: card shows reorder grip (desktop), drop zone border turns accent.
- Selected: accent border + select circle filled.
- Done: struck-through, muted, in the day's foot.
- Empty: EmptyBoard replaces the grid; a cleared day shows a quiet note.
