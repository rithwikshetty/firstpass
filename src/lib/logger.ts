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

const LEVEL_PRIORITY: Record<ConfiguredLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

const MAX_LOG_STRING_LENGTH = 2_000;

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

function writeLog(level: LogLevel, event: string, fields: LogFields = {}) {
  if (!shouldLog(level)) return;

  const record = sanitizeLogValue({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  }) as Record<string, unknown>;
  const line = JSON.stringify(record);

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
