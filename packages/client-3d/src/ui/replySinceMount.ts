/**
 * The server reply a panel may use: the current one, unless it is the very value that was
 * already cached in AppState when the panel mounted. A panel that reopens must seed its
 * fields from the answer to its own request, not from what the previous visit left behind,
 * or a Save would write stale values over someone else's newer change (fix round 1).
 * The reducer builds a new object for every reply, so identity is enough to tell them apart.
 */
export function replySinceMount<Reply>(currentReply: Reply | null, replyAtMount: Reply | null): Reply | null {
  return currentReply === replyAtMount ? null : currentReply;
}
