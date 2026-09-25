// Addresses for subscribing to your TeamHub schedule from a calendar app.
import { api } from './api';

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;

export interface CalendarLinks {
  /** The feed itself, for pasting into any calendar app's "subscribe by URL". */
  feed: string;
  /** Opens the device's calendar app (Apple Calendar on iPhone and Mac) to subscribe. */
  webcal: string;
  google: string;
  outlook: string;
}

export function calendarLinks(token: string): CalendarLinks {
  const feed = `${FUNCTIONS_URL}/calendar?token=${token}`;
  const webcal = feed.replace(/^https?:/, 'webcal:');
  return {
    feed,
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=TeamHub`,
  };
}

export const getCalendarToken = async () => (await api<{ token: string }>('getCalendarFeed')).token;
export const resetCalendarToken = async () => (await api<{ token: string }>('resetCalendarFeed')).token;
