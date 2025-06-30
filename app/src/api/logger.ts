interface Logger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  debug: (...args: any[]) => void;
}

// A stub logger for when the electronAPI is not available (e.g. in tests or storybook)
const consoleLogger: Logger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

const logger: Logger = window.electronAPI?.logger || consoleLogger;

export default logger; 