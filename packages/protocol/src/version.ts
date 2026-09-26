/** Bumped on any breaking change to message shapes. Sent in the handshake.
 *  v2: cards carry an `instanceId` distinct from their catalog `id`, and
 *  `submitTurn` names the instance it plays.
 *  v3: accounts, profiles, roles, and permissions; `roomState.you`/`opponent`
 *  carry `appearance`. */
export const PROTOCOL_VERSION = 3;
