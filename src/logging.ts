import { createLogger, format, transports } from 'winston';

export
const rootLogger = createLogger({
  format: format.combine(
    format.splat(),
    format.timestamp({ format: 'YYYY-mm-dd HH:MM:SS' }),
    format.printf(info => {
      const label = info.label || '<root>';
      const { timestamp: ts, message: msg, level } = info;
      return `[${ts}][${label}][${level}] ${msg}`;
    }),
  ),
  transports: [
    new transports.Console(),
  ],
}); 


export
const getLogger = (name: string) => rootLogger.child({
  label: name,
});
