import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { ExternalLink, Icon } from "@getpaseo/plugin/client/ui";
import type { BoardCard } from "../shared/settings";
import { formatElapsed } from "../shared/day";
import { isDismissed } from "../shared/lanes";
import { gateUrl, type Gate } from "../shared/gates";
import { GroupLabel, PulseDot, attentionColor, monoFont } from "./ui";
import type { AgentEntry, PermissionRequestLite } from "./agent-directory";

/**
 * The live rail: board-linked agents only. Running above Review, so the day's
 * work-in-flight reads top-down. Running rows can be stopped in place; Review
 * rows answer permission waits inline or dismiss the card from the board. It
 * deliberately does not mirror every agent on the daemon; that is
 * better-paseo's question.
 *
 * Review opens with "Waiting on you": the standing gates (chain stalls,
 * not-Done tracker issues, review asks, manual reminders) that only James
 * clears — agent attention comes second because it usually answers itself.
 */

export interface PermissionResponse {
  behavior: "allow" | "deny";
  selectedActionId?: string;
}

export interface RailProps {
  theme: PluginTheme;
  cards: BoardCard[];
  agents: Map<string, AgentEntry>;
  now: number;
  offline: boolean;
  dismissed: Record<string, string>;
  canStop: boolean;
  stoppingIds: ReadonlySet<string>;
  gates: Gate[];
  onOpenAgent(agentId: string): void;
  onOpenCard(cardId: string): void;
  onStop(agentId: string): void;
  onDismiss(agentId: string, stamp: string): void;
  onRespondPermission(agentId: string, requestId: string, response: PermissionResponse): void;
  /** Resolves false when the removal did not save, so the row can uncheck. */
  onCompleteManualGate(id: string): Promise<boolean>;
  onClearDoneNag(key: string): void;
}

interface RailRowData {
  agent: AgentEntry;
  card: BoardCard;
  startedAt: number | null;
}

/** Long enough to see the fill land, short enough to never feel like a wait. */
const CHECK_HOLD_MS = 320;

function railLabel(reason: string | null): string {
  if (reason === "permission") return "Needs you";
  if (reason === "error") return "Errored";
  return "Finished";
}

export function Rail({
  theme,
  cards,
  agents,
  now,
  offline,
  dismissed,
  canStop,
  stoppingIds,
  gates,
  onOpenAgent,
  onOpenCard,
  onStop,
  onDismiss,
  onRespondPermission,
  onCompleteManualGate,
  onClearDoneNag,
}: RailProps) {
  const { running, review } = useMemo(() => {
    const running: RailRowData[] = [];
    const review: RailRowData[] = [];
    for (const card of cards) {
      const run = card.runs[card.runs.length - 1];
      if (!run) continue;
      const agent = agents.get(run.agentId);
      if (!agent) continue;
      const row = { agent, card, startedAt: Date.parse(run.startedAt) };
      if (agent.requiresAttention) {
        if (!isDismissed(agent, dismissed)) review.push(row);
      } else if (agent.status === "running" || agent.status === "initializing") {
        running.push(row);
      }
    }
    return { running, review };
  }, [cards, agents, dismissed]);

  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
      <GroupLabel theme={theme} text="Running" />
      {running.length === 0 && !offline ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, paddingLeft: 2, paddingTop: 4 }}>
          Nothing running.
        </Text>
      ) : (
        running.map(({ agent, card, startedAt }) => (
          <RailRow
            key={agent.id}
            theme={theme}
            card={card}
            color={theme.colors.accent}
            pulse={true}
            elapsed={startedAt ? formatElapsed(startedAt, now) : null}
            onPress={() => onOpenAgent(agent.id)}
            onOpenCard={() => onOpenCard(card.id)}
            trailing={
              canStop ? (
                <StopControl
                  theme={theme}
                  pending={stoppingIds.has(agent.id)}
                  onStop={() => onStop(agent.id)}
                />
              ) : null
            }
          />
        ))
      )}
      {offline ? (
        <Text style={{ color: theme.colors.statusWarning, fontSize: 11, paddingLeft: 2 }}>
          Host offline, times may be stale.
        </Text>
      ) : null}
      <View style={{ height: 14 }} />
      <GroupLabel theme={theme} text="Review" />
      {gates.length > 0 ? (
        <View style={{ gap: 2, paddingTop: 2, paddingBottom: 6 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, paddingLeft: 2, letterSpacing: 0.4 }}>
            WAITING ON YOU
          </Text>
          {gates.map((gate) => (
            <GateRow
              key={gate.id}
              theme={theme}
              gate={gate}
              onCompleteManualGate={onCompleteManualGate}
              onClearDoneNag={onClearDoneNag}
            />
          ))}
        </View>
      ) : null}
      {review.length === 0 && gates.length === 0 && !offline ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, paddingLeft: 2, paddingTop: 4 }}>
          Nothing to review.
        </Text>
      ) : (
        review.map(({ agent, card }) => (
          <View key={agent.id}>
            <RailRow
              theme={theme}
              card={card}
              color={attentionColor(theme, agent.attentionReason)}
              label={railLabel(agent.attentionReason)}
              onPress={() => onOpenAgent(agent.id)}
              onOpenCard={() => onOpenCard(card.id)}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss from board"
                  onPress={() => onDismiss(agent.id, agent.updatedAt)}
                  hitSlop={6}
                >
                  <Icon name="X" size={12} color={theme.colors.foregroundMuted} />
                </Pressable>
              }
            />
            {agent.attentionReason === "permission" && agent.pendingPermissions.length > 0 ? (
              <PermissionBlock
                theme={theme}
                request={agent.pendingPermissions[0]}
                more={agent.pendingPermissions.length - 1}
                onRespond={(requestId, response) => onRespondPermission(agent.id, requestId, response)}
                onGoAnswer={() => onOpenAgent(agent.id)}
              />
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function RailRow({
  theme,
  card,
  color,
  label,
  pulse,
  elapsed,
  trailing,
  onPress,
  onOpenCard,
}: {
  theme: PluginTheme;
  card: BoardCard;
  color: string;
  label?: string;
  pulse?: boolean;
  elapsed?: string | null;
  trailing?: React.ReactNode;
  onPress(): void;
  onOpenCard(): void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={card.title} onPress={onPress} hitSlop={4}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 4 }}>
        {pulse ? (
          <PulseDot color={color} />
        ) : (
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
        )}
        {card.jiraKey ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, fontFamily: monoFont }}>{card.jiraKey}</Text>
        ) : null}
        <Text
          style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "500", flexShrink: 1 }}
          numberOfLines={1}
        >
          {card.title}
        </Text>
        <View style={{ flex: 1 }} />
        {label ? <Text style={{ color, fontSize: 11 }}>{label}</Text> : null}
        {elapsed ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{elapsed}</Text> : null}
        {trailing}
        <Pressable accessibilityRole="button" accessibilityLabel="Open card" onPress={onOpenCard} hitSlop={6}>
          <Icon name="ChevronRight" size={12} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
}

/** Two-tap stop: the first tap arms, the second within three seconds stops. */
function StopControl({ theme, pending, onStop }: { theme: PluginTheme; pending: boolean; onStop(): void }) {
  const [armed, setArmed] = useState(false);
  if (pending) {
    return <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={armed ? "Confirm stop agent" : "Stop agent"}
      onPress={() => {
        if (armed) {
          setArmed(false);
          onStop();
          return;
        }
        setArmed(true);
        setTimeout(() => setArmed(false), 3000);
      }}
      hitSlop={6}
    >
      <Icon name="Square" size={11} color={armed ? theme.colors.statusDanger : theme.colors.foregroundMuted} />
    </Pressable>
  );
}

/** Copy per gate kind; the row's right-aligned label says what James owes. */
function gateLabel(gate: Gate): string {
  switch (gate.kind) {
    case "chain-yours":
      return gate.route === "unrouted" ? "Yours · unrouted" : "Yours";
    case "chain-resumable":
      return "Resumable";
    case "done-nag":
      return gate.status;
    case "review-requested":
      return "Review requested";
    case "changes-requested":
      return "Changes requested";
    case "manual":
      return "";
  }
}

function gateTitle(gate: Gate): string {
  switch (gate.kind) {
    case "chain-yours":
    case "chain-resumable":
      return `${gate.issueKey} · ${gate.issueTitle}`;
    case "done-nag":
      return `${gate.key} · ${gate.title}`;
    case "review-requested":
    case "changes-requested":
      return `${gate.repo}#${gate.number} · ${gate.title}`;
    case "manual":
      return gate.text;
  }
}

function gateColor(theme: PluginTheme, gate: Gate): string {
  if (gate.kind === "chain-yours" || gate.kind === "changes-requested") return theme.colors.statusWarning;
  return theme.colors.foregroundMuted;
}

/**
 * One gate row. Tappable gates open the tracker/PR link; Done-nags clear via
 * the X (the rare permanent opt-out); manual gates check off — the only gate
 * kind with a checkbox, since everything else self-clears on tracker state.
 */
function GateRow({
  theme,
  gate,
  onCompleteManualGate,
  onClearDoneNag,
}: {
  theme: PluginTheme;
  gate: Gate;
  /** Resolves false when the removal did not save, so the row can uncheck. */
  onCompleteManualGate(id: string): Promise<boolean>;
  onClearDoneNag(key: string): void;
}) {
  const [checked, setChecked] = useState(false);
  const url = gateUrl(gate);
  const label = gateLabel(gate);
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, paddingHorizontal: 4 }}>
      {gate.kind === "manual" ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`Check off ${gate.text}`}
          disabled={checked}
          onPress={() => {
            // The box fills before the row leaves, so the check-off reads as
            // done rather than as the reminder vanishing.
            setChecked(true);
            setTimeout(() => {
              void onCompleteManualGate(gate.id.replace(/^manual:/, "")).then((ok) => {
                if (!ok) setChecked(false);
              });
            }, CHECK_HOLD_MS);
          }}
          hitSlop={6}
        >
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              borderWidth: 1,
              borderColor: checked ? theme.colors.statusSuccess : theme.colors.foregroundMuted,
              backgroundColor: checked ? theme.colors.statusSuccess : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {checked ? <Icon name="Check" size={9} color={theme.colors.surface0} /> : null}
          </View>
        </Pressable>
      ) : (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: gateColor(theme, gate) }} />
      )}
      <Text
        style={{
          color: checked ? theme.colors.foregroundMuted : theme.colors.foreground,
          fontSize: 12,
          flexShrink: 1,
          textDecorationLine: checked ? "line-through" : "none",
        }}
        numberOfLines={gate.kind === "manual" ? 2 : 1}
      >
        {gateTitle(gate)}
      </Text>
      <View style={{ flex: 1 }} />
      {label ? (
        <Text style={{ color: gateColor(theme, gate), fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      {gate.kind === "done-nag" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Stop reminding about ${gate.key}`}
          onPress={() => onClearDoneNag(gate.key)}
          hitSlop={6}
        >
          <Icon name="X" size={12} color={theme.colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
  if (!url) return body;
  return (
    <ExternalLink href={url} accessibilityLabel={gateTitle(gate)}>
      {body}
    </ExternalLink>
  );
}

/**
 * Inline permission response for review rows: the first pending request's
 * own actions when it carries them, Allow/Deny otherwise, and a jump to the
 * agent for questions that need typed answers.
 */
function PermissionBlock({
  theme,
  request,
  more,
  onRespond,
  onGoAnswer,
}: {
  theme: PluginTheme;
  request: PermissionRequestLite;
  more: number;
  onRespond(requestId: string, response: PermissionResponse): void;
  onGoAnswer(): void;
}) {
  const needsAnswer = request.kind === "question" || request.kind === "other";
  const actions = request.actions?.length
    ? request.actions
    : [
        { id: "allow", label: "Allow", behavior: "allow" as const },
        { id: "deny", label: "Deny", behavior: "deny" as const },
      ];
  return (
    <View style={{ paddingLeft: 19, paddingBottom: 6, gap: 6 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }} numberOfLines={2}>
        {(request.title ?? request.name ?? "Permission requested") + (more > 0 ? ` · +${more} more` : "")}
      </Text>
      {needsAnswer ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Go answer in agent" onPress={onGoAnswer} hitSlop={4}>
          <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "600" }}>Go answer</Text>
        </Pressable>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => onRespond(request.id, { behavior: action.behavior, selectedActionId: action.id })}
              style={{
                backgroundColor: action.behavior === "allow" ? theme.colors.accent : theme.colors.surface1,
                borderWidth: action.behavior === "allow" ? 0 : 1,
                borderColor: theme.colors.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  color: action.behavior === "allow" ? theme.colors.accentForeground : theme.colors.foreground,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
