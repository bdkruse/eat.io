import { z } from "zod";
import { PROTOCOL_VERSION } from "./version.js";
import {
  CardActionSchema,
  SeatSchema,
  RoomPhaseSchema,
  ResultKindSchema,
  RejectionCodeSchema,
} from "./enums.js";

// ---------- value shapes ----------

export const CardViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  action: CardActionSchema,
  amount: z.number().int().positive(),
  targets: z.number().int().positive(),
});

export const TrayViewSchema = z.object({
  id: z.string(),
  value: z.number().int(),
});

export const ResultSchema = z.object({
  kind: ResultKindSchema,
  scores: z.record(SeatSchema, z.number().int()),
});

const YouViewSchema = z.object({
  seat: SeatSchema,
  name: z.string(),
  score: z.number().int(),
  submitted: z.boolean(),
  table: z.array(TrayViewSchema),
  hand: z.array(CardViewSchema),
});

const OpponentViewSchema = z.object({
  seat: SeatSchema,
  name: z.string(),
  score: z.number().int(),
  submitted: z.boolean(),
  handCount: z.number().int().nonnegative(),
  table: z.array(TrayViewSchema),
  // NB: no `hand` — opponent cards are absent from the payload (§0.8).
});

export const RoomStateSchema = z.object({
  type: z.literal("roomState"),
  phase: RoomPhaseSchema,
  roundIndex: z.number().int().nonnegative(),
  roundCount: z.number().int().positive(),
  deadlineAt: z.number().int().nullable(), // epoch ms; null while paused/waiting
  you: YouViewSchema,
  opponent: OpponentViewSchema,
});

// ---------- client -> server ----------

export const HelloSchema = z.object({
  type: z.literal("hello"),
  protocolVersion: z.number().int(),
  name: z.string().min(1).max(14),
  sessionToken: z.string().optional(),
});
export const QueueJoinSchema = z.object({ type: z.literal("queueJoin") });
export const QueueCancelSchema = z.object({ type: z.literal("queueCancel") });
export const RoomCreatePrivateSchema = z.object({ type: z.literal("roomCreatePrivate") });
export const RoomJoinPrivateSchema = z.object({ type: z.literal("roomJoinPrivate"), code: z.string() });
export const SubmitTurnSchema = z.object({
  type: z.literal("submitTurn"),
  cardId: z.string(),
  targetTrayIds: z.array(z.string()),
});
export const RoomLeaveSchema = z.object({ type: z.literal("roomLeave") });
export const PingSchema = z.object({ type: z.literal("ping") });

export const ClientMessageSchema = z.discriminatedUnion("type", [
  HelloSchema,
  QueueJoinSchema,
  QueueCancelSchema,
  RoomCreatePrivateSchema,
  RoomJoinPrivateSchema,
  SubmitTurnSchema,
  RoomLeaveSchema,
  PingSchema,
]);

// ---------- server -> client ----------

export const WelcomeSchema = z.object({
  type: z.literal("welcome"),
  playerId: z.string(),
  sessionToken: z.string(),
});
export const ErrorSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});
export const QueueWaitingSchema = z.object({ type: z.literal("queueWaiting") });
export const RoomJoinedPrivateSchema = z.object({ type: z.literal("roomJoinedPrivate"), code: z.string() });
export const ActionAcceptedSchema = z.object({ type: z.literal("actionAccepted") });
export const ActionRejectedSchema = z.object({
  type: z.literal("actionRejected"),
  code: RejectionCodeSchema,
  message: z.string(),
});
export const GameOverSchema = z.object({ type: z.literal("gameOver"), result: ResultSchema });
export const OpponentDisconnectedSchema = z.object({
  type: z.literal("opponentDisconnected"),
  graceEndsAt: z.number().int(),
});
export const OpponentReconnectedSchema = z.object({ type: z.literal("opponentReconnected") });
export const PongSchema = z.object({ type: z.literal("pong") });

export const ServerMessageSchema = z.discriminatedUnion("type", [
  WelcomeSchema,
  ErrorSchema,
  QueueWaitingSchema,
  RoomJoinedPrivateSchema,
  RoomStateSchema,
  ActionAcceptedSchema,
  ActionRejectedSchema,
  GameOverSchema,
  OpponentDisconnectedSchema,
  OpponentReconnectedSchema,
  PongSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type RoomStateMessage = z.infer<typeof RoomStateSchema>;
export type CardView = z.infer<typeof CardViewSchema>;
export type TrayView = z.infer<typeof TrayViewSchema>;
export type Result = z.infer<typeof ResultSchema>;

export function parseClientMessage(raw: unknown): ClientMessage {
  return ClientMessageSchema.parse(raw);
}
export function parseServerMessage(raw: unknown): ServerMessage {
  return ServerMessageSchema.parse(raw);
}

export { PROTOCOL_VERSION };
