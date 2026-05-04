import { google } from "googleapis";

/**
 * Google Calendar service module.
 * Handles OAuth2 flow + Calendar CRUD.
 */

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

/** Create a fresh OAuth2 client from env vars */
export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/gcal/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Generate the consent URL that opens Google's account picker */
export function getAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline", // gets refresh_token
    prompt: "consent", // always show account picker
    scope: SCOPES,
  });
}

/** Exchange authorization code for tokens */
export async function exchangeCode(code: string) {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date, ... }
}

/** Get a Calendar client with stored tokens */
export function getCalendarClient(accessToken: string, refreshToken?: string) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return google.calendar({ version: "v3", auth: oauth2 });
}

/** Fetch upcoming events (next 30 days) */
export async function fetchUpcomingEvents(accessToken: string, refreshToken?: string) {
  const cal = getCalendarClient(accessToken, refreshToken);
  const now = new Date();
  const thirtyDaysLater = new Date(now);
  thirtyDaysLater.setDate(now.getDate() + 30);

  const res = await cal.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: thirtyDaysLater.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });

  return (res.data.items || []).map((e) => ({
    id: e.id,
    summary: e.summary || "",
    start: e.start?.dateTime || e.start?.date || "",
    end: e.end?.dateTime || e.end?.date || "",
    description: e.description || "",
  }));
}

/** Create a new calendar event */
export async function createCalendarEvent(
  accessToken: string,
  refreshToken: string | undefined,
  event: {
    summary: string;
    description?: string;
    startDateTime: string; // ISO
    endDateTime: string; // ISO
  }
) {
  const cal = getCalendarClient(accessToken, refreshToken);
  const res = await cal.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startDateTime, timeZone: "Asia/Jerusalem" },
      end: { dateTime: event.endDateTime, timeZone: "Asia/Jerusalem" },
    },
  });
  return res.data;
}
