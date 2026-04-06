import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchUpcomingEvents, createCalendarEvent } from "@/lib/google-calendar";

/**
 * GET /api/gcal/events — fetch upcoming calendar events
 */
export async function GET() {
  const cookieStore = cookies();
  const accessToken = cookieStore.get("gcal_access_token")?.value;
  const refreshToken = cookieStore.get("gcal_refresh_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Not connected to Google Calendar" }, { status: 401 });
  }

  try {
    const events = await fetchUpcomingEvents(accessToken, refreshToken);
    return NextResponse.json({ events });
  } catch (e: any) {
    console.error("[gcal/events] Fetch failed:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/gcal/events — create a new calendar event
 * Body: { summary, description, startDateTime, endDateTime }
 */
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const accessToken = cookieStore.get("gcal_access_token")?.value;
  const refreshToken = cookieStore.get("gcal_refresh_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Not connected to Google Calendar" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const event = await createCalendarEvent(accessToken, refreshToken, {
      summary: body.summary,
      description: body.description || "",
      startDateTime: body.startDateTime,
      endDateTime: body.endDateTime,
    });
    return NextResponse.json({ event });
  } catch (e: any) {
    console.error("[gcal/events] Create failed:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
