import type { ServerMessage } from "@eat.io/protocol";

export type SendFn = (msg: ServerMessage) => void;

export interface SessionInit {
  id: string;
  name: string;
  token: string;
  send: SendFn;
}

export class Session {
  readonly id: string;
  name: string;
  readonly token: string;
  connected = true;
  private sendFn: SendFn;

  constructor(init: SessionInit) {
    this.id = init.id;
    this.name = init.name;
    this.token = init.token;
    this.sendFn = init.send;
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
