/** Bumped on any breaking change to message shapes. Sent in the handshake.
 *  v2: cards carry an `instanceId` distinct from their catalog `id`, and
 *  `submitTurn` names the instance it plays. */
export const PROTOCOL_VERSION = 2;
