import { NextResponse } from "next/server";
import { createUser } from "@/lib/redis";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: string; displayName?: string; password?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { email, displayName, password } = body;

  if (!email || !EMAIL_REGEX.test(email.trim())) {
    return NextResponse.json(
      { error: "Bitte gib eine gültige E-Mail-Adresse ein" },
      { status: 400 }
    );
  }

  if (!displayName || displayName.trim().length < 2) {
    return NextResponse.json(
      { error: "Anzeigename muss mindestens 2 Zeichen lang sein" },
      { status: 400 }
    );
  }

  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Passwort muss mindestens 8 Zeichen lang sein" },
      { status: 400 }
    );
  }

  try {
    await createUser({
      email: email.trim(),
      displayName: displayName.trim(),
      password,
    });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Registrierung fehlgeschlagen";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
