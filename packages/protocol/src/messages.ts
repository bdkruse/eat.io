import { z } from "zod";
import { PROTOCOL_VERSION } from "./version.js";
import {
  CardActionSchema,
  SeatSchema,
  RoomPhaseSchema,
  ResultKindSchema,
  RejectionCodeSchema,
} from "./enums.js";
import { AppearanceSchema, ProfileSchema, AccountErrorCodeSchema } from "./accounts.js";
import { GameSettingsSchema, DeckEntrySchema, AdminErrorCodeSchema } from "./gameConfig.js";
import { ShopItemViewSchema, ShopConfigEntrySchema } from "./shop.js";

// ---------- value shapes ----------

export const CardViewSchema = z.object({
  /** Which card this IS — the catalog id, and the natural key for a future database row.
   *  Repeats across copies: two "Add One Food" cards in a hand share it. */
  id: z.string(),
  /** Which copy this is — unique within a game, so a specific card in hand can be named. */
  instanceId: z.string(),
  name: z.string(),
  action: CardActionSchema,
  amount: z.number().int().positive(),
  /** A tray effect (`add`, `multiply`) takes one or more targets; a table
   *  effect (`addAll`, `extraServings`) takes none. */
  targets: z.number().int().nonnegative(),
  /** Present only on `extraServings`: how many arriving trays it boosts. */
  turns: z.number().int().positive().optional(),
});

export const TrayViewSchema = z.object({
  id: z.string(),
  value: z.number().int(),
});

export const ResultSchema = z.object({
  kind: ResultKindSchema,
  scores: z.record(SeatSchema, z.number().int()),
});

export const YouViewSchema = z.object({
  seat: SeatSchema,
  name: z.string(),
  score: z.number().int(),
  submitted: z.boolean(),
  appearance: AppearanceSchema.nullable(),
  table: z.array(TrayViewSchema),
  hand: z.array(CardViewSchema),
  /** Upcoming bonuses; index 0 boosts the next tray to arrive at this table. */
  extraServings: z.array(z.number().int().positive()),
});

export const OpponentViewSchema = z.object({
  seat: SeatSchema,
  name: z.string(),
  score: z.number().int(),
  submitted: z.boolean(),
  appearance: AppearanceSchema.nullable(),
  handCount: z.number().int().nonnegative(),
  table: z.array(TrayViewSchema),
  // NB: no `hand` — opponent cards are absent from the payload (§0.8).
  /** Upcoming bonuses; public, same shape as `YouView.extraServings`. */
  extraServings: z.array(z.number().int().positive()),
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
  loginToken: z.string().optional(),
});
export const QueueJoinSchema = z.object({ type: z.literal("queueJoin") });
export const QueueCancelSchema = z.object({ type: z.literal("queueCancel") });
export const RoomCreatePrivateSchema = z.object({ type: z.literal("roomCreatePrivate") });
export const RoomJoinPrivateSchema = z.object({ type: z.literal("roomJoinPrivate"), code: z.string() });
export const SubmitTurnSchema = z.object({
  type: z.literal("submitTurn"),
  /** The card INSTANCE being played (CardView.instanceId), never the catalog id. */
  cardInstanceId: z.string(),
  targetTrayIds: z.array(z.string()),
});
export const RoomLeaveSchema = z.object({ type: z.literal("roomLeave") });
export const PingSchema = z.object({ type: z.literal("ping") });

// The string limits here are loose on purpose — the server applies the real
// username/password rules so it can answer with a specific `accountError`
// code instead of a generic `BAD_MESSAGE`.
export const AccountRegisterSchema = z.object({
  type: z.literal("accountRegister"),
  username: z.string().max(64),
  password: z.string().max(256),
});
export const AccountLoginSchema = z.object({
  type: z.literal("accountLogin"),
  username: z.string().max(64),
  password: z.string().max(256),
});
export const AccountLogoutSchema = z.object({ type: z.literal("accountLogout") });
export const AccountChangePasswordSchema = z.object({
  type: z.literal("accountChangePassword"),
  currentPassword: z.string().max(256),
  newPassword: z.string().max(256),
});
export const AppearanceSetSchema = z.object({
  type: z.literal("appearanceSet"),
  appearance: AppearanceSchema,
});
export const ProfileRequestSchema = z.object({ type: z.literal("profileRequest") });

// The settingsSave fields are loose `z.number()` on purpose, same reasoning as
// the account credential fields above: the server answers `adminError`
// `INVALID_SETTINGS` with a specific message rather than a generic `BAD_MESSAGE`.
export const SettingsRequestSchema = z.object({ type: z.literal("settingsRequest") });
export const SettingsSaveSchema = z.object({
  type: z.literal("settingsSave"),
  roundCount: z.number(),
  turnSeconds: z.number(),
  handSize: z.number(),
});
export const DeckRequestSchema = z.object({ type: z.literal("deckRequest") });
export const DeckSaveSchema = z.object({
  type: z.literal("deckSave"),
  cards: z.array(DeckEntrySchema).max(200),
});

export const ShopRequestSchema = z.object({ type: z.literal("shopRequest") });
export const ShopBuySchema = z.object({ type: z.literal("shopBuy"), itemId: z.string().max(64) });
export const ShopConfigRequestSchema = z.object({ type: z.literal("shopConfigRequest") });
export const ShopConfigSaveSchema = z.object({
  type: z.literal("shopConfigSave"),
  items: z.array(ShopConfigEntrySchema).max(200),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  HelloSchema,
  QueueJoinSchema,
  QueueCancelSchema,
  RoomCreatePrivateSchema,
  RoomJoinPrivateSchema,
  SubmitTurnSchema,
  RoomLeaveSchema,
  PingSchema,
  AccountRegisterSchema,
  AccountLoginSchema,
  AccountLogoutSchema,
  AccountChangePasswordSchema,
  AppearanceSetSchema,
  ProfileRequestSchema,
  SettingsRequestSchema,
  SettingsSaveSchema,
  DeckRequestSchema,
  DeckSaveSchema,
  ShopRequestSchema,
  ShopBuySchema,
  ShopConfigRequestSchema,
  ShopConfigSaveSchema,
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
export const QueueCancelledSchema = z.object({ type: z.literal("queueCancelled") });
export const RoomLeftSchema = z.object({ type: z.literal("roomLeft") });
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

export const AccountLoggedInSchema = z.object({
  type: z.literal("accountLoggedIn"),
  profile: ProfileSchema,
  loginToken: z.string().optional(),
});
export const AccountLoggedOutSchema = z.object({
  type: z.literal("accountLoggedOut"),
  reason: z.enum(["requested", "expired"]),
});
export const AccountErrorSchema = z.object({
  type: z.literal("accountError"),
  code: AccountErrorCodeSchema,
  message: z.string(),
});
export const ProfileMessageSchema = z.object({
  type: z.literal("profile"),
  profile: ProfileSchema,
});
export const PasswordChangedSchema = z.object({ type: z.literal("passwordChanged") });

export const SettingsMessageSchema = z.object({
  type: z.literal("settings"),
  settings: GameSettingsSchema,
  updatedAt: z.number().int().nullable(),
  updatedBy: z.string().nullable(),
});

/** The card view fields without `instanceId` (a catalog card has no single
 *  instance) plus `copies`, the count of that card in the deck. */
export const DeckCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  action: CardActionSchema,
  amount: z.number().int().positive(),
  targets: z.number().int().nonnegative(),
  turns: z.number().int().positive().optional(),
  copies: z.number().int(),
});
export const DeckMessageSchema = z.object({
  type: z.literal("deck"),
  cards: z.array(DeckCardSchema),
  total: z.number().int(),
  updatedAt: z.number().int().nullable(),
  updatedBy: z.string().nullable(),
});
export const ShopMessageSchema = z.object({
  type: z.literal("shop"),
  items: z.array(ShopItemViewSchema),
  balance: z.number().int().nonnegative(),
});
export const ShopConfigMessageSchema = z.object({
  type: z.literal("shopConfig"),
  items: z.array(ShopItemViewSchema),
  updatedAt: z.number().int().nullable(),
  updatedBy: z.string().nullable(),
});
export const AdminErrorSchema = z.object({
  type: z.literal("adminError"),
  code: AdminErrorCodeSchema,
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  WelcomeSchema,
  ErrorSchema,
  QueueWaitingSchema,
  QueueCancelledSchema,
  RoomLeftSchema,
  RoomJoinedPrivateSchema,
  RoomStateSchema,
  ActionAcceptedSchema,
  ActionRejectedSchema,
  GameOverSchema,
  OpponentDisconnectedSchema,
  OpponentReconnectedSchema,
  PongSchema,
  AccountLoggedInSchema,
  AccountLoggedOutSchema,
  AccountErrorSchema,
  ProfileMessageSchema,
  PasswordChangedSchema,
  SettingsMessageSchema,
  DeckMessageSchema,
  ShopMessageSchema,
  ShopConfigMessageSchema,
  AdminErrorSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type RoomStateMessage = z.infer<typeof RoomStateSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeSchema>;
export type CardView = z.infer<typeof CardViewSchema>;
export type TrayView = z.infer<typeof TrayViewSchema>;
export type Result = z.infer<typeof ResultSchema>;
export type YouView = z.infer<typeof YouViewSchema>;
export type OpponentView = z.infer<typeof OpponentViewSchema>;
export type DeckCard = z.infer<typeof DeckCardSchema>;

export function parseClientMessage(raw: unknown): ClientMessage {
  return ClientMessageSchema.parse(raw);
}
export function parseServerMessage(raw: unknown): ServerMessage {
  return ServerMessageSchema.parse(raw);
}

export { PROTOCOL_VERSION };
