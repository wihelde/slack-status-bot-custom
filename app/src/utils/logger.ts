import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// Log level hierarchy: DEBUG (0) < INFO (1) < WARN (2) < ERROR (3)
const LOG_LEVEL_HIERARCHY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

class Logger {
  private logDir: string;
  private logFile: string;
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB
  private maxBackups: number = 5;
  private logLevel: LogLevel = 'ERROR'; // Default: ERROR (only errors)

  constructor() {
    // Get log directory from electron app userData path
    if (typeof app !== 'undefined' && app.getPath) {
      this.logDir = path.join(app.getPath('userData'), 'logs');
    } else {
      // Fallback for testing or non-electron environment
      this.logDir = path.join(process.cwd(), '.logs');
    }

    this.logFile = path.join(this.logDir, 'app.log');

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  private formatLog(level: LogLevel, message: string, data?: any): string {
    const timestamp = this.getTimestamp();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
  }

  private rotateLog(): void {
    try {
      // Check if log file exists and is too large
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxFileSize) {
          // Rotate existing backups
          for (let i = this.maxBackups - 1; i >= 1; i--) {
            const oldFile = path.join(this.logDir, `app.log.${i}`);
            const newFile = path.join(this.logDir, `app.log.${i + 1}`);
            if (fs.existsSync(oldFile)) {
              if (i + 1 > this.maxBackups) {
                fs.unlinkSync(oldFile);
              } else {
                fs.renameSync(oldFile, newFile);
              }
            }
          }

          // Move current log to app.log.1
          const backupFile = path.join(this.logDir, 'app.log.1');
          fs.renameSync(this.logFile, backupFile);

          // Clean up old backups beyond maxBackups
          for (let i = this.maxBackups + 1; i <= this.maxBackups + 10; i++) {
            const oldFile = path.join(this.logDir, `app.log.${i}`);
            if (fs.existsSync(oldFile)) {
              fs.unlinkSync(oldFile);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error rotating log file:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_HIERARCHY[level] >= LOG_LEVEL_HIERARCHY[this.logLevel];
  }

  private write(level: LogLevel, message: string, data?: any): void {
    // Skip if log level is below threshold
    if (!this.shouldLog(level)) {
      return;
    }

    try {
      // Rotate if needed
      this.rotateLog();

      // Format and write log
      const logLine = this.formatLog(level, message, data);
      fs.appendFileSync(this.logFile, logLine + '\n');

      // Also log to console
      if (level === 'ERROR') {
        console.error(logLine, data || '');
      } else if (level === 'WARN') {
        console.warn(logLine, data || '');
      } else {
        console.log(logLine, data || '');
      }
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  debug(message: string, data?: any): void {
    this.write('DEBUG', message, data);
  }

  info(message: string, data?: any): void {
    this.write('INFO', message, data);
  }

  warn(message: string, data?: any): void {
    this.write('WARN', message, data);
  }

  error(message: string, data?: any): void {
    this.write('ERROR', message, data);
  }

  getLogFile(): string {
    return this.logFile;
  }

  getLogDir(): string {
    return this.logDir;
  }

  /**
   * Set the minimum log level to display
   * DEBUG = show all, INFO = hide debug, WARN = hide debug+info, ERROR = only errors
   */
  setLogLevel(level: LogLevel): void {
    if (!LOG_LEVEL_HIERARCHY.hasOwnProperty(level)) {
      console.warn(`Invalid log level: ${level}`);
      return;
    }
    this.logLevel = level;
    console.log(`Log level set to ${level}`);
  }

  /**
   * Get current log level
   */
  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Read last N lines from log file
   */
  getRecentLogs(lines: number = 200): string {
    try {
      if (!fs.existsSync(this.logFile)) {
        return '(No logs yet)';
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const allLines = content.split('\n');
      const recentLines = allLines.slice(-lines).join('\n');
      return recentLines;
    } catch (error) {
      return `(Error reading logs: ${error})`;
    }
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        fs.unlinkSync(this.logFile);
        console.log('[Logger] Logs cleared');
      }
      
      // Also clear backup files
      for (let i = 1; i <= this.maxBackups + 10; i++) {
        const backupFile = path.join(this.logDir, `app.log.${i}`);
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }
      }
    } catch (error) {
      console.error('Error clearing logs:', error);
    }
  }
}

// Export singleton instance
export const logger = new Logger();

