type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_COLORS: Record<LogLevel, string> = { debug: "\x1b[36m", info: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" };
const RESET = "\x1b[0m";
const isProd = process.env.NODE_ENV === "production";
const minLevel = (process.env.LOG_LEVEL as LogLevel) || (isProd ? "info" : "debug");

function formatDev(entry: LogEntry): string {
  const color = LEVEL_COLORS[entry.level];
  const ts = entry.timestamp.slice(11, 23);
  let line = `${color}${entry.level.toUpperCase().padEnd(5)}${RESET} ${ts} [${entry.module}] ${entry.message}`;
  if (entry.metadata) line += ` ${JSON.stringify(entry.metadata)}`;
  if (entry.error) line += `\n  ${entry.error.stack || entry.error.message}`;
  return line;
}

function emit(entry: LogEntry) {
  if (LEVEL_PRIORITY[entry.level] < LEVEL_PRIORITY[minLevel]) return;
  const method = entry.level === "debug" ? "log" : entry.level === "error" ? "error" : entry.level === "warn" ? "warn" : "info";
  if (isProd) {
    console[method](JSON.stringify(entry));
  } else {
    console[method](formatDev(entry));
  }
}

function extractError(args: unknown[]): { metadata?: Record<string, unknown>; error?: Error } {
  let metadata: Record<string, unknown> | undefined;
  let error: Error | undefined;
  for (const arg of args) {
    if (arg instanceof Error) error = arg;
    else if (arg && typeof arg === "object" && !Array.isArray(arg)) metadata = arg as Record<string, unknown>;
  }
  return { metadata, error };
}

interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export function createLogger(module: string): Logger {
  const log = (level: LogLevel) => (message: string, ...args: unknown[]) => {
    const { metadata, error } = extractError(args);
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      ...(metadata && { metadata }),
      ...(error && { error: { message: error.message, stack: error.stack } }),
    };
    emit(entry);
  };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}

export const logger = createLogger("app");
