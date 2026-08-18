import { expect, test } from "vitest";
import { CardActionSchema, RoomPhaseSchema, RejectionCodeSchema } from "../src/enums.js";

test("card action accepts add/multiply and rejects others", () => {
  expect(CardActionSchema.parse("add")).toBe("add");
  expect(CardActionSchema.parse("multiply")).toBe("multiply");
  expect(() => CardActionSchema.parse("plate")).toThrow();
});

test("room phase includes paused and abandoned", () => {
  expect(RoomPhaseSchema.parse("paused")).toBe("paused");
  expect(RoomPhaseSchema.parse("abandoned")).toBe("abandoned");
});

test("rejection code is a known machine code", () => {
  expect(RejectionCodeSchema.parse("CARD_NOT_HELD")).toBe("CARD_NOT_HELD");
  expect(() => RejectionCodeSchema.parse("nope")).toThrow();
});
