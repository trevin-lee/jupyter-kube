const isElectron = !!window.electronAPI;

const logger = {
  info: (...args: any[]): void => {
    if (isElectron && window.electronAPI.logger) {
      window.electronAPI.logger.info(...args);
    } else {
      console.log(...args);
    }
  },
  warn: (...args: any[]): void => {
    if (isElectron && window.electronAPI.logger) {
      window.electronAPI.logger.warn(...args);
    } else {
      console.warn(...args);
    }
  },
  error: (...args: any[]): void => {
    if (isElectron && window.electronAPI.logger) {
      window.electronAPI.logger.error(...args);
    } else {
      console.error(...args);
    }
  },
  debug: (...args: any[]): void => {
    if (isElectron && window.electronAPI.logger) {
      window.electronAPI.logger.debug(...args);
    } else {
      console.debug(...args);
    }
  },
};

export default logger; 