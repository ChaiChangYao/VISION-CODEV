import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ObservabilityContext {
  traceId: string;
  companyId?: string;
  memberId?: string;
  requestId?: string;
}

export interface LogRecord extends ObservabilityContext {
  level: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  fields?: Record<string, unknown>;
}

export type LogSink = (record: LogRecord) => void;

const contextStorage = new AsyncLocalStorage<ObservabilityContext>();

export function createTraceId(): string {
  return randomUUID();
}

export function currentObservabilityContext(): ObservabilityContext | undefined {
  return contextStorage.getStore();
}

export function withObservabilityContext<T>(context: ObservabilityContext, fn: () => T): T {
  return contextStorage.run(context, fn);
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { value: error };
}

export class Logger {
  public constructor(private readonly sink: LogSink = (record) => console.log(JSON.stringify(record)), private readonly fields: Pick<LogRecord, 'service' | 'companyId' | 'memberId'> = {}) {}

  public child(fields: Pick<LogRecord, 'service' | 'companyId' | 'memberId'>): Logger {
    return new Logger(this.sink, { ...this.fields, ...fields });
  }

  public log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    const context = currentObservabilityContext();
    const record: LogRecord = {
      level,
      message,
      timestamp: new Date().toISOString(),
      traceId: context?.traceId ?? createTraceId(),
    };
    const companyId = context?.companyId ?? this.fields.companyId;
    const memberId = context?.memberId ?? this.fields.memberId;
    const service = this.fields.service;
    if (companyId !== undefined) record.companyId = companyId;
    if (memberId !== undefined) record.memberId = memberId;
    if (service !== undefined) record.service = service;
    if (fields !== undefined) record.fields = fields;
    this.sink(record);
  }

  public debug(message: string, fields?: Record<string, unknown>): void { this.log('debug', message, fields); }
  public info(message: string, fields?: Record<string, unknown>): void { this.log('info', message, fields); }
  public warn(message: string, fields?: Record<string, unknown>): void { this.log('warn', message, fields); }
  public error(message: string, fields?: Record<string, unknown>): void { this.log('error', message, fields); }
}

export function createLogger(service: string, sink?: LogSink): Logger {
  return new Logger(sink, { service });
}
