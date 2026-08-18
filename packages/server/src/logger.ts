export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

type LogFn = (msg: string, fields?: Record<string, unknown>) => void;

export interface Logger {
  debug: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(level: LogLevel, base: Record<string, unknown> = {}): Logger {
  const at = (lvl: LogLevel): LogFn => (msg, fields = {}) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const line = JSON.stringify({ level: lvl, msg, ...base, ...fields });
    if (lvl === "error" || lvl === "warn") console.error(line);
    else console.log(line);
  };
  return {
    debug: at("debug"),
    info: at("info"),
    warn: at("warn"),
    error: at("error"),
    child: (bindings) => createLogger(level, { ...base, ...bindings }),
  };
}
