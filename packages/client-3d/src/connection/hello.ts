import type { ClientMessage, ServerMessage } from "@eat.io/protocol";

export type HelloMessage = Extract<ClientMessage, { type: "hello" }>;

/**
 * The hello every socket open sends — the first one and every reconnect alike. A
 * reconnect resends both tokens it has: sessionToken to reclaim the same in-progress
 * connection, loginToken to resume the account if the server has already dropped that
 * session (it does as soon as a socket closes outside a room, §11).
 */
export function buildHello(input: {
  protocolVersion: number;
  name: string;
  sessionToken: string | null;
  loginToken: string | null;
}): HelloMessage {
  const hello: HelloMessage = {
    type: "hello",
    protocolVersion: input.protocolVersion,
    name: input.name,
  };
  if (input.sessionToken) hello.sessionToken = input.sessionToken;
  if (input.loginToken) hello.loginToken = input.loginToken;
  return hello;
}

/**
 * The login token the NEXT hello should carry, given the one held now and a message just
 * received. A fresh login or registration hands over a new token; a token resume's
 * accountLoggedIn has none and keeps the one already held; any logout (requested or an
 * expired resume) means there is no longer a token worth resending.
 */
export function nextLoginToken(currentLoginToken: string | null, message: ServerMessage): string | null {
  if (message.type === "accountLoggedIn" && message.loginToken) return message.loginToken;
  if (message.type === "accountLoggedOut") return null;
  return currentLoginToken;
}
