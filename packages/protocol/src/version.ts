/** Bumped on any breaking change to message shapes. Sent in the handshake.
 *  v2: cards carry an `instanceId` distinct from their catalog `id`, and
 *  `submitTurn` names the instance it plays.
 *  v3: accounts, profiles, roles, and permissions; `roomState.you`/`opponent`
 *  carry `appearance`.
 *  v4: table-effect cards (`addAll`, `extraServings`); `CardView.targets` can be
 *  0 and gains optional `turns`; `roomState.you`/`opponent` carry
 *  `extraServings`; new `settings.edit`/`deck.edit` permissions; game settings
 *  and deck editor messages (`settingsRequest`/`settingsSave`/`deckRequest`/
 *  `deckSave` and `settings`/`deck`/`adminError`). Also in v4: Lunch Money
 *  (`Profile.lunchMoney`); the shop and shop editor messages (`shopRequest`/
 *  `shopBuy`/`shopConfigRequest`/`shopConfigSave` and `shop`/`shopConfig`); the
 *  `shop.edit` permission; the face fields on `Appearance` (`eyeShape`/`eyeColor`/
 *  `mouthShape`); the `accountError` codes `NOT_OWNED`/`NOT_AVAILABLE`/
 *  `ALREADY_OWNED`/`NOT_ENOUGH`; and the optional `TrayView.bonus`.
 *  v5: the clothing fields on `Appearance` (`top`/`bottom`/`onePiece`/`graphic`,
 *  each defaulting so older looks parse); four more `skinTone` values (ten in
 *  all); the shop item kinds `top`/`onePiece`/`graphic` and the six clothing
 *  items (`top.catEarHoodie`, `onePiece.sparklyDress`, `graphic.rubberDuck`,
 *  `graphic.dinosaur`, `graphic.taco`, `graphic.rainbow`); the `practiceStart`
 *  client message; and the required `roomState.mode` (`"match"` or
 *  `"practice"`). */
export const PROTOCOL_VERSION = 5;
