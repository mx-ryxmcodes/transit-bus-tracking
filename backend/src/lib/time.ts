import { env } from '../config/env';

const hourFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: env.APP_TZ });
const dateFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: env.APP_TZ });

/** Hour of day (0-23) in APP_TZ. */
export const tzHour = (d: Date) => Number(hourFmt.format(d));
/** YYYY-MM-DD in APP_TZ. */
export const tzDate = (d: Date) => dateFmt.format(d);
