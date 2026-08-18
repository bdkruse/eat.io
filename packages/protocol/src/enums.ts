import { z } from "zod";

export const CardActionSchema = z.enum(["add", "multiply"]);
export type CardAction = z.infer<typeof CardActionSchema>;

export const SeatSchema = z.enum(["a", "b"]);
export type Seat = z.infer<typeof SeatSchema>;

export const RoomPhaseSchema = z.enum([
  "waiting",
  "in-progress",
  "paused",
  "finished",
  "abandoned",
]);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

export const ResultKindSchema = z.enum(["win", "loss", "draw"]);
export type ResultKind = z.infer<typeof ResultKindSchema>;

export const RejectionCodeSchema = z.enum([
  "NOT_IN_ROOM",
  "NOT_YOUR_TURN",
  "ALREADY_SUBMITTED",
  "CARD_NOT_HELD",
  "WRONG_TARGET_COUNT",
  "BAD_TARGET",
]);
export type RejectionCode = z.infer<typeof RejectionCodeSchema>;
