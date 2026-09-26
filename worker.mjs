const SESSION_MAX_AGE = 60 * 60 * 24;
const PBKDF2_ITERATIONS = 100000;

const encoder = new TextEncoder();

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";

  for (const cookie of cookieHeader.split(";")) {
    const [key, ...parts] = cookie.trim().split("=");

    if (key === name) {
      return decodeURIComponent(parts.join("="));
    }
  }

  return null;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function hashPassword(password) {
  const salt = crypto.randomUUID().replaceAll("-", "");

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );

  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${bytesToHex(
    new Uint8Array(bits)
  )}`;
}

async function verifyPassword(password, stored) {
  try {
    if (!stored || typeof stored !== "string") {
      return false;
    }

    const parts = stored.split("$");

    if (parts.length !== 4) {
      return false;
    }

    const [
      algorithm,
      iterationsString,
      salt,
      expectedHash
    ] = parts;

    if (algorithm !== "pbkdf2") {
      return false;
    }

    const iterations = Number(iterationsString);

    if (!Number.isInteger(iterations) || iterations <= 0) {
      return false;
    }

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

    const actualHash = bytesToHex(
      new Uint8Array(bits)
    );

    return constantTimeEqual(
      actualHash,
      expectedHash
    );
  } catch {
    return false;
  }
}

async function initializeSettings(env) {
  const defaults = [
    [
      "admin_password",
      env.INITIAL_ADMIN_PASSWORD
    ],
    [
      "user_password",
      env.INITIAL_USER_PASSWORD
    ],
    [
      "viewer_password",
      env.INITIAL_VIEWER_PASSWORD
    ]
  ];

  for (const [key, initialPassword] of defaults) {
    if (!initialPassword) {
      continue;
    }

    const existing = await env.DB
      .prepare(
        "SELECT value FROM settings WHERE key = ?"
      )
      .bind(key)
      .first();

    if (!existing) {
      const hashed = await hashPassword(
        initialPassword
      );

      await env.DB
        .prepare(
          "INSERT INTO settings (key, value) VALUES (?, ?)"
        )
        .bind(key, hashed)
        .run();
    }
  }
}

async function createSession(env, role) {
  const sessionId = crypto.randomUUID();
  const createdAt = Date.now();

  await env.DB
    .prepare(
      "INSERT INTO sessions (id, role, created_at) VALUES (?, ?, ?)"
    )
    .bind(
      sessionId,
      role,
      createdAt
    )
    .run();

  return sessionId;
}

async function getSession(request, env) {
  const sessionId = getCookie(
    request,
    "session"
  );

  if (!sessionId) {
    return null;
  }

  const row = await env.DB
    .prepare(
      "SELECT id, role, created_at FROM sessions WHERE id = ?"
    )
    .bind(sessionId)
    .first();

  if (!row) {
    return null;
  }

  const createdAt = Number(
    row.created_at
  );

  if (
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt >
      SESSION_MAX_AGE * 1000
  ) {
    await env.DB
      .prepare(
        "DELETE FROM sessions WHERE id = ?"
      )
      .bind(sessionId)
      .run();

    return null;
  }

  return row;
}

async function requireSession(request, env) {
  return await getSession(
    request,
    env
  );
}

async function requireAdmin(request, env) {
  const session =
    await requireSession(
      request,
      env
    );

  if (
    !session ||
    session.role !== "admin"
  ) {
    return null;
  }

  return session;
}

function sessionCookie(sessionId) {
  return [
    `session=${encodeURIComponent(sessionId)}`,
    `Max-Age=${SESSION_MAX_AGE}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure"
  ].join("; ");
}

function clearSessionCookie() {
  return [
    "session=",
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure"
  ].join("; ");
}

async function login(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        error: "Некорректный JSON"
      },
      400
    );
  }

  const password = String(
    body?.password || ""
  );

  if (!password) {
    return json(
      {
        error: "Введите пароль"
      },
      400
    );
  }

  const result = await env.DB
    .prepare(`
      SELECT key, value
      FROM settings
      WHERE key IN (?, ?, ?)
    `)
    .bind(
      "admin_password",
      "user_password",
      "viewer_password"
    )
    .all();

  const passwords = {};

  for (
    const row of result.results || []
  ) {
    passwords[row.key] =
      row.value;
  }

  let role = null;

  if (
    passwords.admin_password &&
    await verifyPassword(
      password,
      passwords.admin_password
    )
  ) {
    role = "admin";
  } else if (
    passwords.user_password &&
    await verifyPassword(
      password,
      passwords.user_password
    )
  ) {
    role = "user";
  } else if (
    passwords.viewer_password &&
    await verifyPassword(
      password,
      passwords.viewer_password
    )
  ) {
    role = "viewer";
  }

  if (!role) {
    return json(
      {
        error: "Неверный пароль"
      },
      401
    );
  }

  const sessionId =
    await createSession(
      env,
      role
    );

  return json(
    {
      ok: true,
      role
    },
    200,
    {
      "Set-Cookie":
        sessionCookie(
          sessionId
        )
    }
  );
}

async function logout(request, env) {
  const sessionId =
    getCookie(
      request,
      "session"
    );

  if (sessionId) {
    await env.DB
      .prepare(
        "DELETE FROM sessions WHERE id = ?"
      )
      .bind(sessionId)
      .run();
  }

  return json(
    {
      ok: true
    },
    200,
    {
      "Set-Cookie":
        clearSessionCookie()
    }
  );
}

async function sessionInfo(
  request,
  env
) {
  const session =
    await getSession(
      request,
      env
    );

  if (!session) {
    return json({
      authenticated: false,
      role: null
    });
  }

  return json({
    authenticated: true,
    role: session.role
  });
}

async function getTimers(
  request,
  env
) {
  const session =
    await requireSession(
      request,
      env
    );

  if (!session) {
    return json(
      {
        error: "Не авторизован"
      },
      401
    );
  }

  const result = await env.DB
    .prepare(`
      SELECT
        id,
        system,
        anomaly,
        description,
        days,
        hours,
        minutes,
        seconds,
        remaining_seconds,
        running,
        started_at
      FROM timers
      ORDER BY id ASC
    `)
    .all();

  return json({
    timers:
      result.results || []
  });
}

async function createTimer(
  request,
  env
) {
  const session =
    await requireSession(
      request,
      env
    );

  if (!session) {
    return json(
      {
        error: "Не авторизован"
      },
      401
    );
  }

  if (
    session.role === "viewer"
  ) {
    return json(
      {
        error:
          "Viewer не может создавать таймеры"
      },
      403
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        error: "Некорректный JSON"
      },
      400
    );
  }

  const system = String(
    body?.system ?? ""
  );

  const anomaly = String(
    body?.anomaly ?? ""
  );

  const description = String(
    body?.description ?? ""
  );

  const days = Math.max(
    0,
    Number(body?.days) || 0
  );

  const hours = Math.max(
    0,
    Number(body?.hours) || 0
  );

  const minutes = Math.max(
    0,
    Number(body?.minutes) || 0
  );

  const seconds = Math.max(
    0,
    Number(body?.seconds) || 0
  );

  const remainingSeconds =
    days * 86400 +
    hours * 3600 +
    minutes * 60 +
    seconds;

  const result = await env.DB
    .prepare(`
      INSERT INTO timers (
        system,
        anomaly,
        description,
        days,
        hours,
        minutes,
        seconds,
        remaining_seconds,
        running,
        started_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
    `)
    .bind(
      system,
      anomaly,
      description,
      days,
      hours,
      minutes,
      seconds,
      remainingSeconds
    )
    .run();

  return json({
    ok: true,
    id:
      result.meta
        .last_row_id
  });
}

async function updateTimer(
  request,
  env,
  id
) {
  const session =
    await requireSession(
      request,
      env
    );

  if (!session) {
    return json(
      {
        error: "Не авторизован"
      },
      401
    );
  }

  if (
    session.role === "viewer"
  ) {
    return json(
      {
        error:
          "Viewer не может изменять таймеры"
      },
      403
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        error: "Некорректный JSON"
      },
      400
    );
  }

  const existing =
    await env.DB
      .prepare(
        "SELECT * FROM timers WHERE id = ?"
      )
      .bind(id)
      .first();

  if (!existing) {
    return json(
      {
        error: "Таймер не найден"
      },
      404
    );
  }

  const system =
    body?.system !== undefined
      ? String(body.system)
      : String(
          existing.system || ""
        );

  const anomaly =
    body?.anomaly !== undefined
      ? String(body.anomaly)
      : String(
          existing.anomaly || ""
        );

  const description =
    body?.description !== undefined
      ? String(
          body.description
        )
      : String(
          existing.description || ""
        );

  const days =
    body?.days !== undefined
      ? Math.max(
          0,
          Number(body.days) || 0
        )
      : Number(
          existing.days
        ) || 0;

  const hours =
    body?.hours !== undefined
      ? Math.max(
          0,
          Number(body.hours) || 0
        )
      : Number(
          existing.hours
        ) || 0;

  const minutes =
    body?.minutes !== undefined
      ? Math.max(
          0,
          Number(body.minutes) || 0
        )
      : Number(
          existing.minutes
        ) || 0;

  const seconds =
    body?.seconds !== undefined
      ? Math.max(
          0,
          Number(body.seconds) || 0
        )
      : Number(
          existing.seconds
        ) || 0;

  const remainingSeconds =
    days * 86400 +
    hours * 3600 +
    minutes * 60 +
    seconds;

  await env.DB
    .prepare(`
      UPDATE timers
      SET
        system = ?,
        anomaly = ?,
        description = ?,
        days = ?,
        hours = ?,
        minutes = ?,
        seconds = ?,
        remaining_seconds = ?
      WHERE id = ?
    `)
    .bind(
      system,
      anomaly,
      description,
      days,
      hours,
      minutes,
      seconds,
      remainingSeconds,
      id
    )
    .run();

  return json({
    ok: true
  });
}

async function deleteTimer(
  request,
  env,
  id
) {
  const session =
    await requireSession(
      request,
      env
    );

  if (!session) {
    return json(
      {
        error: "Не авторизован"
      },
      401
    );
  }

  if (
    session.role === "viewer"
  ) {
    return json(
      {
        error:
          "Viewer не может удалять таймеры"
      },
      403
    );
  }

  await env.DB
    .prepare(
      "DELETE FROM timers WHERE id = ?"
    )
    .bind(id)
    .run();

  return json({
    ok: true
  });
}

async function changeTimerState(
  request,
  env,
  id
) {
  const session =
    await requireSession(
      request,
      env
    );

  if (!session) {
    return json(
      {
        error: "Не авторизован"
      },
      401
    );
  }

  if (
    session.role === "viewer"
  ) {
    return json(
      {
        error:
          "Viewer не может изменять таймеры"
      },
      403
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        error: "Некорректный JSON"
      },
      400
    );
  }

  const timer =
    await env.DB
      .prepare(
        "SELECT * FROM timers WHERE id = ?"
      )
      .bind(id)
      .first();

  if (!timer) {
    return json(
      {
        error: "Таймер не найден"
      },
      404
    );
  }

  if (
    body.action === "start"
  ) {
    await env.DB
      .prepare(`
        UPDATE timers
        SET
          running = 1,
          started_at = ?
        WHERE id = ?
      `)
      .bind(
        Date.now(),
        id
      )
      .run();

    return json({
      ok: true
    });
  }

  if (
    body.action === "stop"
  ) {
    let remaining =
      Number(
        timer.remaining_seconds
      ) || 0;

    if (
      Number(timer.running) === 1 &&
      timer.started_at
    ) {
      const elapsed =
        Math.floor(
          (
            Date.now() -
            Number(
              timer.started_at
            )
          ) / 1000
        );

      remaining = Math.max(
        0,
        remaining - elapsed
      );
    }

    await env.DB
      .prepare(`
        UPDATE timers
        SET
          remaining_seconds = ?,
          running = 0,
          started_at = NULL
        WHERE id = ?
      `)
      .bind(
        remaining,
        id
      )
      .run();

    return json({
      ok: true,
      remaining_seconds:
        remaining
    });
  }

  return json(
    {
      error:
        "Неизвестное действие"
    },
    400
  );
}

async function changePasswords(
  request,
  env
) {
  const session =
    await requireAdmin(
      request,
      env
    );

  if (!session) {
    return json(
      {
        error:
          "Требуются права администратора"
      },
      403
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        error: "Некорректный JSON"
      },
      400
    );
  }

  const updates = [];

  if (
    body?.admin_password
  ) {
    updates.push([
      "admin_password",
      String(
        body.admin_password
      )
    ]);
  }

  if (
    body?.user_password
  ) {
    updates.push([
      "user_password",
      String(
        body.user_password
      )
    ]);
  }

  if (
    body?.viewer_password
  ) {
    updates.push([
      "viewer_password",
      String(
        body.viewer_password
      )
    ]);
  }

  if (updates.length === 0) {
    return json(
      {
        error:
          "Не передан ни один пароль"
      },
      400
    );
  }

  for (
    const [key, password] of updates
  ) {
    const hashed =
      await hashPassword(
        password
      );

    await env.DB
      .prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value
      `)
      .bind(
        key,
        hashed
      )
      .run();
  }

  return json({
    ok: true
  });
}

export default {
  async fetch(request, env) {
    try {
      await initializeSettings(
        env
      );

      const url =
        new URL(request.url);

      if (
        url.pathname ===
          "/api/login" &&
        request.method ===
          "POST"
      ) {
        return await login(
          request,
          env
        );
      }

      if (
        url.pathname ===
          "/api/logout" &&
        request.method ===
          "POST"
      ) {
        return await logout(
          request,
          env
        );
      }

      if (
        url.pathname ===
          "/api/session" &&
        request.method ===
          "GET"
      ) {
        return await sessionInfo(
          request,
          env
        );
      }

      if (
        url.pathname ===
          "/api/timers" &&
        request.method ===
          "GET"
      ) {
        return await getTimers(
          request,
          env
        );
      }

      if (
        url.pathname ===
          "/api/timers" &&
        request.method ===
          "POST"
      ) {
        return await createTimer(
          request,
          env
        );
      }

      const timerMatch =
        url.pathname.match(
          /^\/api\/timers\/(\d+)$/
        );

      if (timerMatch) {
        const id =
          Number(
            timerMatch[1]
          );

        if (
          request.method ===
          "PUT"
        ) {
          let body;

          try {
            body =
              await request
                .clone()
                .json();
          } catch {
            return json(
              {
                error:
                  "Некорректный JSON"
              },
              400
            );
          }

          if (
            body?.action ===
              "start" ||
            body?.action ===
              "stop"
          ) {
            return await changeTimerState(
              request,
              env,
              id
            );
          }

          return await updateTimer(
            request,
            env,
            id
          );
        }

        if (
          request.method ===
          "DELETE"
        ) {
          return await deleteTimer(
            request,
            env,
            id
          );
        }
      }

      if (
        url.pathname ===
          "/api/passwords" &&
        request.method ===
          "PUT"
      ) {
        return await changePasswords(
          request,
          env
        );
      }

      return env.ASSETS.fetch(
        request
      );
    } catch (error) {
      console.error(error);

      return json(
        {
          error: String(
            error?.message ||
              error
          )
        },
        500
      );
    }
  }
};
