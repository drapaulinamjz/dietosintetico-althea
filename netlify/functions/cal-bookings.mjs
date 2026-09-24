import crypto from "node:crypto";

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export default async (req) => {
  if (req.method !== "GET") {
    return Response.json({ error: "Método no permitido." }, { status: 405 });
  }

  const adminKey = process.env.ALTHEA_ADMIN_KEY;
  const calKey = process.env.CAL_API_KEY;
  const suppliedKey = req.headers.get("x-admin-key") || "";

  if (!adminKey) {
    return Response.json({ error: "Falta configurar ALTHEA_ADMIN_KEY en Netlify." }, { status: 500 });
  }
  if (!safeEqual(suppliedKey, adminKey)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!calKey) {
    return Response.json({ error: "Falta configurar CAL_API_KEY en Netlify." }, { status: 500 });
  }

  const url = new URL("https://api.cal.com/v2/bookings");
  url.searchParams.set("status", "upcoming");
  url.searchParams.set("limit", "100");
  url.searchParams.set("sortStart", "asc");

  const calRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${calKey}`,
      "cal-api-version": "2026-02-25",
      Accept: "application/json"
    }
  });

  let body = {};
  try { body = await calRes.json(); } catch {}

  if (!calRes.ok) {
    return Response.json({
      error: body?.message || body?.error?.message || "Cal.com rechazó la solicitud.",
      calStatus: calRes.status
    }, { status: 502 });
  }

  const bookings = (Array.isArray(body.data) ? body.data : []).map((b) => {
    const a = Array.isArray(b.attendees) && b.attendees.length ? b.attendees[0] : {};
    return {
      uid: b.uid,
      title: b.title || b.eventType?.slug || "Consulta",
      status: b.status,
      start: b.start,
      end: b.end,
      duration: b.duration,
      eventType: b.eventType?.slug || "",
      attendee: {
        name: a?.name || "",
        email: a?.email || "",
        phoneNumber: a?.phoneNumber || ""
      }
    };
  });

  return Response.json({ bookings, pagination: body.pagination || null, syncedAt: new Date().toISOString() }, {
    headers: { "cache-control": "no-store, max-age=0" }
  });
};

export const config = { path: "/api/cal-bookings" };
