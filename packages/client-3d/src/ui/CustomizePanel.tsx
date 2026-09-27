import { useEffect } from "react";
import type { ShopItemView } from "@eat.io/protocol";
import { useGame } from "../state/GameProvider.js";
import { selectScreen } from "../state/gameState.js";
import {
  ACCESSORIES,
  EYE_COLORS,
  EYE_SHAPES,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTH_SHAPES,
  PANTS_COLORS,
  randomAppearance,
  SHIRT_COLORS,
  SKIN_TONES,
  type Accessory,
  type Appearance,
  type EyeShape,
  type HairStyle,
  type MouthShape,
} from "../appearance/appearance.js";
import { useLocalState } from "../state/LocalState.js";
import { CoinIcon, LockIcon } from "./icons.js";
import { optionRowEntries, type OptionEntry } from "./optionRows.js";

const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
  short: "Short",
  bob: "Bob",
  curly: "Curly",
  ponytail: "Ponytail",
  buzz: "Buzz",
  puffs: "Puffs",
};

const ACCESSORY_LABELS: Record<Accessory, string> = {
  none: "None",
  glasses: "Glasses",
  cap: "Cap",
  headband: "Headband",
  beanie: "Beanie",
  sunglasses: "Sunglasses",
  bowTie: "Bow Tie",
  headphones: "Headphones",
  chefHat: "Chef Hat",
  crown: "Crown",
  propellerCap: "Propeller Cap",
  trafficCone: "Traffic Cone Hat",
  vikingHelmet: "Viking Helmet",
  alienAntennae: "Alien Antennae",
  bananaHat: "Banana Hat",
};

const EYE_SHAPE_LABELS: Record<EyeShape, string> = {
  round: "Round",
  almond: "Almond",
  sleepy: "Sleepy",
  sparkly: "Sparkly",
  star: "Star Eyes",
  heart: "Heart Eyes",
};

const MOUTH_SHAPE_LABELS: Record<MouthShape, string> = {
  smile: "Smile",
  grin: "Big Grin",
  calm: "Calm",
  smirk: "Smirk",
  tongue: "Tongue Out",
  fangs: "Vampire Fangs",
};

/** A row without shop values (skin, hair style, pants): every option is free. */
function freeEntries<Value extends string>(values: readonly Value[]): OptionEntry<Value>[] {
  return values.map((value) => ({ value, status: "free" }));
}

/** Picking a free or owned option wears it; picking a locked one opens the shop there. */
function pickHandler<Value extends string>(
  entry: OptionEntry<Value>,
  onPick: (value: Value) => void,
  onOpenShop: (itemId: string) => void,
): () => void {
  return entry.status === "locked" ? () => onOpenShop(entry.itemId) : () => onPick(entry.value);
}

function SwatchRow<ColorValue extends string>({
  label,
  entries,
  value,
  onPick,
  onOpenShop,
}: {
  label: string;
  entries: readonly OptionEntry<ColorValue>[];
  value: ColorValue;
  onPick: (color: ColorValue) => void;
  onOpenShop: (itemId: string) => void;
}) {
  return (
    <div className="option-row">
      <span className="option-row__label">{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {entries.map((entry) => {
          const picked = entry.value === value;
          const locked = entry.status === "locked";
          return (
            <span key={entry.value} className="swatch-option">
              <button
                className={`swatch${picked ? " swatch--picked" : ""}${locked ? " swatch--locked" : ""}`}
                style={{ background: entry.value }}
                role="radio"
                aria-checked={picked}
                aria-label={locked ? `${entry.value}, locked, ${entry.price} Lunch Money` : entry.value}
                onClick={pickHandler(entry, onPick, onOpenShop)}
              >
                {locked && <LockIcon />}
              </button>
              {locked && (
                <span className="swatch-option__price">
                  <CoinIcon size={10} />
                  {entry.price}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ChoiceRow<Choice extends string>({
  label,
  entries,
  labels,
  value,
  onPick,
  onOpenShop,
}: {
  label: string;
  entries: readonly OptionEntry<Choice>[];
  labels: Record<Choice, string>;
  value: Choice;
  onPick: (choice: Choice) => void;
  onOpenShop: (itemId: string) => void;
}) {
  return (
    <div className="option-row">
      <span className="option-row__label">{label}</span>
      <div className="chips" role="radiogroup" aria-label={label}>
        {entries.map((entry) => {
          const picked = entry.value === value;
          const locked = entry.status === "locked";
          return (
            <button
              key={entry.value}
              className={`chip${picked ? " chip--picked" : ""}${locked ? " chip--locked" : ""}`}
              role="radio"
              aria-checked={picked}
              aria-label={locked ? `${labels[entry.value]}, locked, ${entry.price} Lunch Money` : undefined}
              onClick={pickHandler(entry, onPick, onOpenShop)}
            >
              {locked && <LockIcon />}
              {labels[entry.value]}
              {locked && (
                <span className="chip__price">
                  <CoinIcon size={11} />
                  {entry.price}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Your look. Free values, plus the shop values you own; the ones you have not bought show a
 * lock and their price, and picking one opens the shop at that item (§13.4). A guest owns
 * nothing and has no shop, so a guest sees only the free values. Edits stay local until
 * Done, which saves them for an account or shares them for a guest (§11).
 */
export function CustomizePanel() {
  const { state, requestShop } = useGame();
  const { appearance, setAppearance, setCustomizing, openShop } = useLocalState();
  const account = state.account;
  const loggedIn = account !== null;
  const waiting = selectScreen(state) === "queue";
  const update = (change: Partial<Appearance>) => setAppearance({ ...appearance, ...change });

  // The prices of the locked options come from the shop.
  useEffect(() => {
    if (loggedIn) requestShop();
    // Runs when the panel mounts, and again if the player logs in with it open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const ownedItemIds = account?.ownedItems ?? [];
  const shopItems: ShopItemView[] | null = account ? (state.shop?.items ?? null) : null;
  const shopRow = <Value extends string>(field: keyof Appearance, values: readonly Value[]) =>
    optionRowEntries(field, values, ownedItemIds, shopItems);

  return (
    <section className="panel panel--customize">
      <h2 className="panel__title">Your kid</h2>
      {waiting && <p className="panel__note">Still looking for a lunch buddy — you will be seated when they arrive.</p>}

      <SwatchRow label="Skin" entries={freeEntries(SKIN_TONES)} value={appearance.skinTone} onPick={(skinTone) => update({ skinTone })} onOpenShop={openShop} />
      <ChoiceRow label="Hair" entries={freeEntries(HAIR_STYLES)} labels={HAIR_STYLE_LABELS} value={appearance.hairStyle} onPick={(hairStyle) => update({ hairStyle })} onOpenShop={openShop} />
      <SwatchRow label="Hair color" entries={shopRow("hairColor", HAIR_COLORS)} value={appearance.hairColor} onPick={(hairColor) => update({ hairColor })} onOpenShop={openShop} />
      <ChoiceRow label="Eyes" entries={shopRow("eyeShape", EYE_SHAPES)} labels={EYE_SHAPE_LABELS} value={appearance.eyeShape} onPick={(eyeShape) => update({ eyeShape })} onOpenShop={openShop} />
      <SwatchRow label="Eye color" entries={shopRow("eyeColor", EYE_COLORS)} value={appearance.eyeColor} onPick={(eyeColor) => update({ eyeColor })} onOpenShop={openShop} />
      <ChoiceRow label="Mouth" entries={shopRow("mouthShape", MOUTH_SHAPES)} labels={MOUTH_SHAPE_LABELS} value={appearance.mouthShape} onPick={(mouthShape) => update({ mouthShape })} onOpenShop={openShop} />
      <SwatchRow label="Shirt" entries={shopRow("shirtColor", SHIRT_COLORS)} value={appearance.shirtColor} onPick={(shirtColor) => update({ shirtColor })} onOpenShop={openShop} />
      <SwatchRow label="Pants" entries={freeEntries(PANTS_COLORS)} value={appearance.pantsColor} onPick={(pantsColor) => update({ pantsColor })} onOpenShop={openShop} />
      <ChoiceRow label="Extra" entries={shopRow("accessory", ACCESSORIES)} labels={ACCESSORY_LABELS} value={appearance.accessory} onPick={(accessory) => update({ accessory })} onOpenShop={openShop} />

      <div className="panel__actions panel__actions--row">
        <button className="button button--secondary" onClick={() => setAppearance(randomAppearance(Math.floor(Math.random() * 1e9)))}>
          Surprise me
        </button>
        <button className="button button--primary" onClick={() => setCustomizing(false)}>
          Done
        </button>
      </div>
      <p className="panel__note">
        {account ? "Saved to your account." : "Your opponent sees this look. It resets when you reload."}
      </p>
    </section>
  );
}
