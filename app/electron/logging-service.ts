import { app } from 'electron'
import log from 'electron-log'
import path from 'path'

class LoggingService {
  constructor() {
    log.transports.file.resolvePath = () =>
      path.join(app.getPath('logs'), 'main.log')
    log.transports.file.level = 'info'
    log.transports.file.format =
      '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
    log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB

    if (process.env.IS_DEV === 'true') {
      log.transports.console.level = 'debug'
    } else {
      log.transports.console.level = false
    }

    log.catchErrors({
      showDialog: process.env.IS_DEV === 'true'
    })
  }

  private formatMessage(...args: any[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            return JSON.stringify(arg, null, 2)
          } catch {
            return '[Unserializable Object]'
          }
        }
        return String(arg)
      })
      .join(' ')
  }

  info(...args: any[]): void {
    log.info(this.formatMessage(...args))
  }

  warn(...args: any[]): void {
    log.warn(this.formatMessage(...args))
  }

  error(...args: any[]): void {
    log.error(this.formatMessage(...args))
  }

  debug(...args: any[]): void {
    log.debug(this.formatMessage(...args))
  }

  // For renderer process
  logFromRenderer(
    level: 'info' | 'warn' | 'error' | 'debug',
    ...args: any[]
  ): void {
    this[level](...args)
  }
}

export const logger = new LoggingService() 