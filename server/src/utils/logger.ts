type Level = 'info' | 'warn' | 'error';

function log(level: Level, scope: string, message: string, extra?: unknown) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${message}`;
  if (extra !== undefined) {
    console.log(line, extra);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (scope: string, message: string, extra?: unknown) => log('info', scope, message, extra),
  warn: (scope: string, message: string, extra?: unknown) => log('warn', scope, message, extra),
  error: (scope: string, message: string, extra?: unknown) => log('error', scope, message, extra),
};
