/** Bumped on any breaking change to message shapes. Sent in the handshake.
 *  v2: cards carry an `instanceId` distinct from their catalog `id`, and
 *  `submitTurn` names the instance it plays.
 *  v3: accounts, profiles, roles, and permissions; `roomState.you`/`opponent`
 *  carry `appearance`.
 *  v4: table-effect cards (`addAll`, `extraServings`); `CardView.targets` can be
 *  0 and gains optional `turns`; `roomState.you`/`opponent` carry
 *  `extraServings`; new `settings.edit`/`deck.edit` permissions; game settings
 *  and deck editor messages (`settingsRequest`/`settingsSave`/`deckRequest`/
 *  `deckSave` and `settings`/`deck`/`adminError`). */
export const PROTOCOL_VERSION = 4;
