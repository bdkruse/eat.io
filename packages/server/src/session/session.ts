import type { Appearance, ServerMessage } from "@eat.io/protocol";
import { LoginGuard } from "../accounts/loginGuard.js";
import type { Clock } from "../lobby/timers.js";

export type SendFn = (msg: ServerMessage) => void;

export interface SessionInit {
  id: string;
  name: string;
  token: string;
  send: SendFn;
  clock: Clock;
}

export class Session {
  readonly id: string;
  /** The display name: the account's username while logged in, else `guestName`. */
  name: string;
  /** The name sent in `hello`, restored when the session logs out. */
  readonly guestName: string;
  readonly token: string;
  connected = true;
  accountId: number | null = null;
  appearance: Appearance | null = null;
  loginToken: string | null = null;
  readonly loginGuard: LoginGuard;
  private sendFn: SendFn;

  constructor(init: SessionInit) {
    this.id = init.id;
    this.name = init.name;
    this.guestName = init.name;
    this.token = init.token;
    this.sendFn = init.send;
    this.loginGuard = new LoginGuard(init.clock);
  }

  send(msg: ServerMessage): void {
    if (this.connected) this.sendFn(msg);
  }

  attach(send: SendFn): void {
    this.sendFn = send;
    this.connected = true;
  }

  detach(): void {
    this.connected = false;
  }
}
