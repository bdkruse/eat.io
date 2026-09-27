import type { DeckEntry, GameSettings } from "@eat.io/protocol";
import type { Clock } from "../lobby/timers.js";
import type { AccountsDatabase } from "../accounts/database.js";

export interface SettingsRecord {
  settings: GameSettings;
  updatedAt: number | null;
  updatedBy: string | null;
}

export interface DeckRecord {
  entries: DeckEntry[];
  updatedAt: number | null;
  updatedBy: string | null;
}

interface GameSettingsRow {
  round_count: number;
  turn_seconds: number;
  hand_size: number;
  updated_at: number | null;
  updated_by_username: string | null;
}

interface DeckEntryRow {
  card_id: string;
  copies: number;
}

interface DeckMetaRow {
  updated_at: number | null;
  updated_by_username: string | null;
}

/**
 * The one row of game settings and the default deck, both seeded once by
 * `ensureDefaults` and from then on changed only by an admin's or the Creator's save.
 * Limits are not enforced here (the lobby does that, with the protocol helpers); the
 * database's CHECK constraints are only a backstop against a bad direct write.
 */
export class GameConfigStore {
  constructor(
    private readonly database: AccountsDatabase,
    private readonly clock: Clock,
  ) {}

  /** Inserts the given settings and deck composition, but only where a row is missing. */
  ensureDefaults(settings: GameSettings, deck: readonly DeckEntry[]): void {
    const ensure = this.database.transaction(() => {
      this.database
        .prepare(
          "INSERT OR IGNORE INTO game_settings (id, round_count, turn_seconds, hand_size) VALUES (1, ?, ?, ?)",
        )
        .run(settings.roundCount, settings.turnSeconds, settings.handSize);

      this.database.prepare("INSERT OR IGNORE INTO default_deck_meta (id) VALUES (1)").run();

      const insertCard = this.database.prepare(
        "INSERT OR IGNORE INTO default_deck (card_id, copies) VALUES (?, ?)",
      );
      for (const entry of deck) {
        insertCard.run(entry.cardId, entry.copies);
      }
    });
    ensure();
  }

  getSettings(): SettingsRecord {
    const row = this.database
      .prepare(
        `SELECT
           game_settings.round_count AS round_count,
           game_settings.turn_seconds AS turn_seconds,
           game_settings.hand_size AS hand_size,
           game_settings.updated_at AS updated_at,
           accounts.username AS updated_by_username
         FROM game_settings
         LEFT JOIN accounts ON accounts.id = game_settings.updated_by
         WHERE game_settings.id = 1`,
      )
      .get() as GameSettingsRow | undefined;
    if (!row) throw new Error("GameConfigStore.getSettings: no settings row; call ensureDefaults first");

    return {
      settings: { roundCount: row.round_count, turnSeconds: row.turn_seconds, handSize: row.hand_size },
      updatedAt: row.updated_at,
      updatedBy: row.updated_by_username,
    };
  }

  saveSettings(settings: GameSettings, accountId: number): void {
    const updatedAt = this.clock.now();
    this.database
      .prepare(
        `INSERT INTO game_settings (id, round_count, turn_seconds, hand_size, updated_at, updated_by)
         VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           round_count = excluded.round_count,
           turn_seconds = excluded.turn_seconds,
           hand_size = excluded.hand_size,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      )
      .run(settings.roundCount, settings.turnSeconds, settings.handSize, updatedAt, accountId);
  }

  getDeck(): DeckRecord {
    const entryRows = this.database
      .prepare("SELECT card_id, copies FROM default_deck")
      .all() as DeckEntryRow[];
    const metaRow = this.database
      .prepare(
        `SELECT default_deck_meta.updated_at AS updated_at, accounts.username AS updated_by_username
         FROM default_deck_meta
         LEFT JOIN accounts ON accounts.id = default_deck_meta.updated_by
         WHERE default_deck_meta.id = 1`,
      )
      .get() as DeckMetaRow | undefined;

    return {
      entries: entryRows.map((row) => ({ cardId: row.card_id, copies: row.copies })),
      updatedAt: metaRow?.updated_at ?? null,
      updatedBy: metaRow?.updated_by_username ?? null,
    };
  }

  /** Replaces the whole deck table in one transaction, so a card left out of `entries` is gone. */
  saveDeck(entries: DeckEntry[], accountId: number): void {
    const updatedAt = this.clock.now();
    const save = this.database.transaction((entriesToSave: DeckEntry[]) => {
      this.database.prepare("DELETE FROM default_deck").run();
      const insertCard = this.database.prepare("INSERT INTO default_deck (card_id, copies) VALUES (?, ?)");
      for (const entry of entriesToSave) {
        insertCard.run(entry.cardId, entry.copies);
      }

      this.database
        .prepare(
          `INSERT INTO default_deck_meta (id, updated_at, updated_by)
           VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`,
        )
        .run(updatedAt, accountId);
    });
    save(entries);
  }
}
