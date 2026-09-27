import { z } from "zod";

// ---------- appearance ----------

export const SKIN_TONES = ["#f6d7bf", "#eec19b", "#d9a47a", "#b87a4f", "#8d5634", "#5e3a24"] as const;
export const HAIR_STYLES = ["short", "bob", "curly", "ponytail", "buzz", "puffs"] as const;
export const HAIR_COLORS = ["#2b2220", "#3d2a1e", "#5a3825", "#8a3b1f", "#c4622d", "#d9b25f"] as const;
export const SHIRT_COLORS = ["#d94f3d", "#4a7fa5", "#5f9e4a", "#e8a33d", "#7d5ba6", "#3e9c95", "#e07a9a", "#f4f1ea"] as const;
export const PANTS_COLORS = ["#3f5a7a", "#b59a6d", "#444a52", "#6b7048"] as const;
export const ACCESSORIES = ["none", "glasses", "cap", "headband", "beanie"] as const;

export const AppearanceSchema = z.object({
  skinTone: z.enum(SKIN_TONES),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: z.enum(HAIR_COLORS),
  shirtColor: z.enum(SHIRT_COLORS),
  pantsColor: z.enum(PANTS_COLORS),
  accessory: z.enum(ACCESSORIES),
});
export type Appearance = z.infer<typeof AppearanceSchema>;
export type HairStyle = Appearance["hairStyle"];
export type Accessory = Appearance["accessory"];

// ---------- roles and permissions ----------

export const ROLES = ["player", "admin", "creator"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;
export const PERMISSIONS = ["admin.open", "settings.edit", "deck.edit"] as const;
export const PermissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof PermissionSchema>;
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  player: [],
  admin: ["admin.open", "settings.edit"],
  creator: PERMISSIONS,
};
export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
export const ROLE_LABELS: Record<Role, string> = { player: "Player", admin: "Admin", creator: "Creator" };

// ---------- credentials ----------

export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,14}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}
export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

// ---------- profile ----------

export const ProfileSchema = z.object({
  username: z.string(),
  role: RoleSchema,
  permissions: z.array(PermissionSchema),
  appearance: AppearanceSchema.nullable(),
  pointsScored: z.number().int().nonnegative(),
  gamesPlayed: z.number().int().nonnegative(),
  gamesWon: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  lastLoginAt: z.number().int().nullable(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const AccountErrorCodeSchema = z.enum([
  "INVALID_USERNAME",
  "INVALID_PASSWORD",
  "USERNAME_TAKEN",
  "BAD_CREDENTIALS",
  "WRONG_PASSWORD",
  "RATE_LIMITED",
  "NOT_LOGGED_IN",
  "BUSY",
]);
export type AccountErrorCode = z.infer<typeof AccountErrorCodeSchema>;
