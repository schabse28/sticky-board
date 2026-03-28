import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateUserProfile, redis, PRESENCE_CHANNEL } from "@/lib/redis";

const VALID_COLORS = new Set(["yellow", "green", "pink", "blue", "purple"]);

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  let body: { displayName?: string; color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  const { displayName, color } = body;

  if (displayName !== undefined) {
    const name = displayName.trim();
    if (name.length < 2 || name.length > 40) {
      return NextResponse.json(
        { error: "Name muss zwischen 2 und 40 Zeichen lang sein" },
        { status: 400 }
      );
    }
  }

  if (color !== undefined && !VALID_COLORS.has(color)) {
    return NextResponse.json({ error: "Ungültige Farbe" }, { status: 400 });
  }

  if (!displayName && !color) {
    return NextResponse.json({ error: "Keine Änderungen angegeben" }, { status: 400 });
  }

  const userId = session.user.id;
  await updateUserProfile(userId, {
    displayName: displayName?.trim(),
    color,
  });

  // user_updated-Event an alle verbundenen Clients senden
  const event = {
    type: "user_updated",
    userId,
    displayName: displayName?.trim() ?? session.user.name ?? "",
    color: color ?? "",
  };
  await redis.publish(PRESENCE_CHANNEL, JSON.stringify(event));

  return NextResponse.json({ success: true });
}
