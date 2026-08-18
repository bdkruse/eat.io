export interface Clock {
  now(): number;
}

export type Cancel = () => void;

export interface Timers {
  schedule(delayMs: number, cb: () => void): Cancel;
}

export const systemClock: Clock = { now: () => Date.now() };

export const systemTimers: Timers = {
  schedule(delayMs, cb) {
    const handle = setTimeout(cb, delayMs);
    return () => clearTimeout(handle);
  },
};

interface Scheduled {
  at: number;
  cb: () => void;
  live: boolean;
}

export function manualTime(): { clock: Clock; timers: Timers; advance(ms: number): void } {
  let current = 0;
  const scheduled: Scheduled[] = [];

  const clock: Clock = { now: () => current };
  const timers: Timers = {
    schedule(delayMs, cb) {
      const entry: Scheduled = { at: current + delayMs, cb, live: true };
      scheduled.push(entry);
      return () => {
        entry.live = false;
      };
    },
  };

  function advance(ms: number): void {
    const target = current + ms;
    for (;;) {
      const due = scheduled
        .filter((s) => s.live && s.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      current = due.at;
      due.live = false;
      due.cb();
    }
    current = target;
  }

  return { clock, timers, advance };
}
