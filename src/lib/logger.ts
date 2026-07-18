export type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | Error
  | LogValue[]
  | { [key: string]: LogValue };

export type LogFields = Record<string, LogValue>;

type LogLevel = "debug" | "info" | "warn" | "error";
type ConfiguredLogLevel = LogLevel | "silent";
type LogFormat = "json" | "pretty";

const LEVEL_PRIORITY: Record<ConfiguredLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const MAX_LOG_STRING_LENGTH = 2_000;
const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  gray: "\u001b[90m",
  cyan: "\u001b[36m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
} as const;

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: ANSI.gray,
  info: ANSI.cyan,
  warn: ANSI.yellow,
  error: ANSI.red,
};

const PRETTY_OMITTED_FIELDS = new Set([
  "userAgent",
  "clientIp",
  "vercelId",
  "origin",
  "contentLength",
  "route",
]);

function configuredLogFormat(): LogFormat {
  const configured = process.env.LOG_FORMAT?.toLowerCase();
  if (configured === "json" || configured === "pretty") return configured;
  return process.env.NODE_ENV === "development" ? "pretty" : "json";
}

function configuredLogLevel(): ConfiguredLogLevel {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  if (
    configured === "debug" ||
    configured === "info" ||
    configured === "warn" ||
    configured === "error" ||
    configured === "silent"
  ) {
    return configured;
  }

  return process.env.NODE_ENV === "test" ? "silent" : "info";
}

function shouldLog(level: LogLevel) {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configuredLogLevel()];
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("password") ||
    normalized.includes("secret") ||
    normalized.includes("api_key") ||
    normalized.includes("apikey") ||
    normalized.includes("api-key") ||
    normalized === "token" ||
    normalized.endsWith("token")
  );
}

function truncate(value: string) {
  if (value.length <= MAX_LOG_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}...`;
}

export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: truncate(error.message),
      stack: error.stack ? truncate(error.stack) : undefined,
    };
  }

  return {
    name: typeof error,
    message: truncate(String(error)),
  };
}

function sanitizeLogValue(value: LogValue, key = "", depth = 0): unknown {
  if (key && isSensitiveKey(key)) return "[redacted]";
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return sanitizeLogValue(serializeError(value));
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeLogValue(entry, "", depth + 1));
  }
  if (depth > 5) return "[truncated]";

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeLogValue(entryValue, entryKey, depth + 1),
    ]),
  );
}

function prettyValue(value: unknown) {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatPrettyLog(record: Record<string, unknown>) {
  const timestamp = new Date(String(record.timestamp))
    .toTimeString()
    .slice(0, 8);
  const level = String(record.level) as LogLevel;
  const event = String(record.event);
  const fields = Object.entries(record)
    .filter(
      ([key, value]) =>
        key !== "timestamp" &&
        key !== "level" &&
        key !== "event" &&
        value !== undefined &&
        !PRETTY_OMITTED_FIELDS.has(key),
    )
    .map(([key, value]) => {
      const rendered =
        key === "requestId" && typeof value === "string"
          ? value.slice(0, 8)
          : prettyValue(value);
      return `${key}=${rendered}`;
    });

  const prefix = `${ANSI.dim}${timestamp}${ANSI.reset} ${LEVEL_COLORS[level]}${level.toUpperCase()}${ANSI.reset} ${ANSI.bold}${event}${ANSI.reset}`;
  return fields.length > 0 ? `${prefix}  ${fields.join(" ")}` : prefix;
}

function writeLog(level: LogLevel, event: string, fields: LogFields = {}) {
  if (!shouldLog(level)) return;

  const record = sanitizeLogValue({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  }) as Record<string, unknown>;
  const line =
    configuredLogFormat() === "pretty"
      ? formatPrettyLog(record)
      : JSON.stringify(record);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (level === "debug") {
    console.debug(line);
  } else {
    console.info(line);
  }
}

export const logger = {
  debug: (event: string, fields?: LogFields) => writeLog("debug", event, fields),
  info: (event: string, fields?: LogFields) => writeLog("info", event, fields),
  warn: (event: string, fields?: LogFields) => writeLog("warn", event, fields),
  error: (event: string, fields?: LogFields) => writeLog("error", event, fields),
};

export function elapsedMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}
