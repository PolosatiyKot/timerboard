const SESSION_MAX_AGE = 60 * 60 * 24;
const PBKDF2_ITERATIONS = 100000;

async function fetchHandler(request, env) {
try {
const url = new URL(request.url);

```
if (url.pathname === "/api/login" && request.method === "POST") {
  return await login(request, env);
}

if (url.pathname === "/api/logout" && request.method === "POST") {
  return await logout(request, env);
}

if (url.pathname === "/api/session" && request.method === "GET") {
  return await getSession(request, env);
}

if (url.pathname === "/api/timers" && request.method === "GET") {
  return await getTimers(request, env);
}

if (url.pathname === "/api/timers" && request.method === "POST") {
  return await createTimer(request, env);
}

if (url.pathname.startsWith("/api/timers/") && request.method === "PUT") {
  const id = url.pathname.split("/").pop();
  return await updateTimer(request, env, id);
}

if (url.pathname.startsWith("/api/timers/") && request.method === "DELETE") {
  const id = url.pathname.split("/").pop();
  return await deleteTimer(request, env, id);
}

if (url.pathname === "/api/passwords" && request.method === "PUT") {
  return await changePasswords(request, env);
}

return env.ASSETS.fetch(request);
```

} catch (error) {
console.error("Worker error:", error);
return json({ error: "Внутренняя ошибка сервера" }, 500);
}
}

export default {
fetch: fetchHandler
};

async function initializeSettings(env) {
const settings = await env.DB
.prepare("SELECT key FROM settings")
.all();

const existing = new Set(
(settings.results || []).map(row => row.key)
);

const inserts = [];

if (!existing.has("admin_password") && env.INITIAL_ADMIN_PASSWORD) {
const hash = await hashPassword(env.INITIAL_ADMIN_PASSWORD);

```
inserts.push(
  env.DB
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('admin_password', ?)"
    )
    .bind(hash)
);
```

}

if (!existing.has("user_password") && env.INITIAL_USER_PASSWORD) {
const hash = await hashPassword(env.INITIAL_USER_PASSWORD);

```
inserts.push(
  env.DB
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('user_password', ?)"
    )
    .bind(hash)
);
```

}

if (!existing.has("viewer_password") && env.INITIAL_VIEWER_PASSWORD) {
const hash = await hashPassword(env.INITIAL_VIEWER_PASSWORD);

```
inserts.push(
  env.DB
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('viewer_password', ?)"
    )
    .bind(hash)
);
```

}

if (inserts.length > 0) {
await env.DB.batch(inserts);
}
}

async function login(request, env) {
const body = await request.json();
const password = String(body.password || "");

if (!password) {
return json({ error: "Введите пароль" }, 400);
}

await initializeSettings(env);

const admin = await env.DB
.prepare("SELECT value FROM settings WHERE key = 'admin_password'")
.first();

const user = await env.DB
.prepare("SELECT value FROM settings WHERE key = 'user_password'")
.first();

const viewer = await env.DB
.prepare("SELECT value FROM settings WHERE key = 'viewer_password'")
.first();

let role = null;

if (admin && await verifyPassword(password, admin.value)) {
role = "admin";
} else if (user && await verifyPassword(password, user.value)) {
role = "user";
} else if (viewer && await verifyPassword(password, viewer.value)) {
role = "viewer";
}

if (!role) {
return json({ error: "Неверный пароль" }, 401);
}

const sessionId = crypto.randomUUID();
const createdAt = Date.now();

await env.DB
.prepare(
"INSERT INTO sessions (id, role, created_at) VALUES (?, ?, ?)"
)
.bind(sessionId, role, createdAt)
.run();

const cookie =
"session=" +
sessionId +
"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" +
SESSION_MAX_AGE;

return new Response(
JSON.stringify({
ok: true,
role: role
}),
{
status: 200,
headers: {
"Content-Type": "application/json",
"Set-Cookie": cookie
}
}
);
}

async function getCurrentSession(request, env) {
const cookies = request.headers.get("Cookie") || "";

const match = cookies.match(/(?:^|;\s*)session=([^;]+)/);

if (!match) {
return null;
}

const sessionId = match[1];

const session = await env.DB
.prepare(
"SELECT id, role, created_at FROM sessions WHERE id = ?"
)
.bind(sessionId)
.first();

if (!session) {
return null;
}

if (
Date.now() - Number(session.created_at) >
SESSION_MAX_AGE * 1000
) {
await env.DB
.prepare("DELETE FROM sessions WHERE id = ?")
.bind(sessionId)
.run();

```
return null;
```

}

return session;
}

async function getSession(request, env) {
await initializeSettings(env);

const session = await getCurrentSession(request, env);

if (!session) {
return json({
authenticated: false
});
}

return json({
authenticated: true,
role: session.role
});
}

async function logout(request, env) {
const cookies = request.headers.get("Cookie") || "";

const match = cookies.match(/(?:^|;\s*)session=([^;]+)/);

if (match) {
await env.DB
.prepare("DELETE FROM sessions WHERE id = ?")
.bind(match[1])
.run();
}

return new Response(
JSON.stringify({
ok: true
}),
{
status: 200,
headers: {
"Content-Type": "application/json",
"Set-Cookie":
"session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
}
}
);
}

async function getTimers(request, env) {
await initializeSettings(env);

const session = await getCurrentSession(request, env);

if (!session) {
return json({
error: "Не авторизован"
}, 401);
}

const result = await env.DB
.prepare(
"SELECT id, system, anomaly, description, days, hours, minutes, seconds, remaining_seconds, running, started_at FROM timers ORDER BY id ASC"
)
.all();

const now = Date.now();

const timers = result.results.map(function(timer) {
let remaining = Number(timer.remaining_seconds || 0);

```
if (Number(timer.running) === 1) {
  const startedAt = Number(timer.started_at || 0);

  if (startedAt > 0) {
    const elapsed = Math.floor(
      (now - startedAt) / 1000
    );

    remaining = Math.max(
      0,
      remaining - elapsed
    );
  }
}

return {
  id: timer.id,
  system: timer.system || "",
  anomaly: timer.anomaly || "",
  description: timer.description || "",
  days: Number(timer.days || 0),
  hours: Number(timer.hours || 0),
  minutes: Number(timer.minutes || 0),
  seconds: Number(timer.seconds || 0),
  remaining_seconds: remaining,
  running:
    remaining > 0 &&
    Number(timer.running) === 1
      ? 1
      : 0,
  started_at: timer.started_at || null
};
```

});

return json(timers);
}

async function createTimer(request, env) {
const session = await getCurrentSession(request, env);

if (!session) {
return json({
error: "Не авторизован"
}, 401);
}

if (session.role === "viewer") {
return json({
error: "Viewer не может создавать таймеры"
}, 403);
}

const body = await request.json();

const system = String(body.system || "");
const anomaly = String(body.anomaly || "");
const description = String(body.description || "");

const days = positiveInteger(body.days);
const hours = positiveInteger(body.hours);
const minutes = positiveInteger(body.minutes);
const seconds = positiveInteger(body.seconds);

const remaining =
days * 86400 +
hours * 3600 +
minutes * 60 +
seconds;

const result = await env.DB
.prepare(
"INSERT INTO timers (system, anomaly, description, days, hours, minutes, seconds, remaining_seconds, running) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
)
.bind(
system,
anomaly,
description,
days,
hours,
minutes,
seconds,
remaining
)
.run();

const id = Number(result.meta.last_row_id);

return json({
ok: true,
id: id,
timer: {
id: id,
system: system,
anomaly: anomaly,
description: description,
days: days,
hours: hours,
minutes: minutes,
seconds: seconds,
remaining_seconds: remaining,
running: 0,
started_at: null
}
}, 201);
}

async function updateTimer(request, env, id) {
const session = await getCurrentSession(request, env);

if (!session) {
return json({
error: "Не авторизован"
}, 401);
}

if (session.role === "viewer") {
return json({
error: "Viewer не может изменять таймеры"
}, 403);
}

const existing = await env.DB
.prepare("SELECT * FROM timers WHERE id = ?")
.bind(id)
.first();

if (!existing) {
return json({
error: "Таймер не найден"
}, 404);
}

const body = await request.json();

let system = String(existing.system || "");
let anomaly = String(existing.anomaly || "");
let description = String(existing.description || "");

let days = Number(existing.days || 0);
let hours = Number(existing.hours || 0);
let minutes = Number(existing.minutes || 0);
let seconds = Number(existing.seconds || 0);

let remaining = Number(existing.remaining_seconds || 0);
let running = Number(existing.running || 0);

let startedAt = existing.started_at
? Number(existing.started_at)
: 0;

if ("system" in body) {
system = String(body.system || "");
}

if ("anomaly" in body) {
anomaly = String(body.anomaly || "");
}

if ("description" in body) {
description = String(body.description || "");
}

if (
"days" in body ||
"hours" in body ||
"minutes" in body ||
"seconds" in body
) {
days = positiveInteger(body.days);
hours = positiveInteger(body.hours);
minutes = positiveInteger(body.minutes);
seconds = positiveInteger(body.seconds);

```
remaining =
  days * 86400 +
  hours * 3600 +
  minutes * 60 +
  seconds;

running = 0;
startedAt = 0;
```

}

if ("remaining_seconds" in body) {
remaining = Math.max(
0,
positiveInteger(body.remaining_seconds)
);
}

if ("running" in body) {
running = body.running ? 1 : 0;

```
if (running === 1 && remaining > 0) {
  startedAt = Date.now();
} else {
  running = 0;
  startedAt = 0;
}
```

}

if (running === 0) {
startedAt = 0;
}

await env.DB
.prepare(
"UPDATE timers SET system = ?, anomaly = ?, description = ?, days = ?, hours = ?, minutes = ?, seconds = ?, remaining_seconds = ?, running = ?, started_at = ? WHERE id = ?"
)
.bind(
system,
anomaly,
description,
days,
hours,
minutes,
seconds,
remaining,
running,
startedAt || null,
id
)
.run();

return json({
ok: true,
timer: {
id: Number(id),
system: system,
anomaly: anomaly,
description: description,
days: days,
hours: hours,
minutes: minutes,
seconds: seconds,
remaining_seconds: remaining,
running: running,
started_at: startedAt || null
}
});
}

async function deleteTimer(request, env, id) {
const session = await getCurrentSession(request, env);

if (!session) {
return json({
error: "Не авторизован"
}, 401);
}

if (session.role === "viewer") {
return json({
error: "Viewer не может удалять таймеры"
}, 403);
}

await env.DB
.prepare("DELETE FROM timers WHERE id = ?")
.bind(id)
.run();

return json({
ok: true
});
}

async function changePasswords(request, env) {
const session = await getCurrentSession(request, env);

if (!session || session.role !== "admin") {
return json({
error: "Только администратор может менять пароли"
}, 403);
}

const body = await request.json();

if (body.adminPassword) {
const hash = await hashPassword(body.adminPassword);

```
await env.DB
  .prepare(
    "UPDATE settings SET value = ? WHERE key = 'admin_password'"
  )
  .bind(hash)
  .run();
```

}

if (body.userPassword) {
const hash = await hashPassword(body.userPassword);

```
await env.DB
  .prepare(
    "UPDATE settings SET value = ? WHERE key = 'user_password'"
  )
  .bind(hash)
  .run();
```

}

if (body.viewerPassword) {
const hash = await hashPassword(body.viewerPassword);

```
const existingViewer = await env.DB
  .prepare(
    "SELECT value FROM settings WHERE key = 'viewer_password'"
  )
  .first();

if (existingViewer) {
  await env.DB
    .prepare(
      "UPDATE settings SET value = ? WHERE key = 'viewer_password'"
    )
    .bind(hash)
    .run();
} else {
  await env.DB
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('viewer_password', ?)"
    )
    .bind(hash)
    .run();
}
```

}

return json({
ok: true
});
}

async function hashPassword(password) {
const salt = crypto.randomUUID();
const encoder = new TextEncoder();

const key = await crypto.subtle.importKey(
"raw",
encoder.encode(password),
{
name: "PBKDF2"
},
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
key,
256
);

const hash = bytesToHex(
new Uint8Array(bits)
);

return (
"pbkdf2$" +
PBKDF2_ITERATIONS +
"$" +
salt +
"$" +
hash
);
}

async function verifyPassword(password, stored) {
try {
const parts = String(stored || "").split("$");

```
if (
  parts.length !== 4 ||
  parts[0] !== "pbkdf2"
) {
  return false;
}

const iterations = Number(parts[1]);
const salt = parts[2];
const expectedHash = parts[3];

const encoder = new TextEncoder();

const key = await crypto.subtle.importKey(
  "raw",
  encoder.encode(password),
  {
    name: "PBKDF2"
  },
  false,
  ["deriveBits"]
);

const bits = await crypto.subtle.deriveBits(
  {
    name: "PBKDF2",
    salt: encoder.encode(salt),
    iterations: iterations,
    hash: "SHA-256"
  },
  key,
  256
);

const actualHash = bytesToHex(
  new Uint8Array(bits)
);

return constantTimeEqual(
  actualHash,
  expectedHash
);
```

} catch (error) {
return false;
}
}

function bytesToHex(bytes) {
return Array.from(bytes)
.map(function(byte) {
return byte
.toString(16)
.padStart(2, "0");
})
.join("");
}

function constantTimeEqual(a, b) {
if (a.length !== b.length) {
return false;
}

let result = 0;

for (let i = 0; i < a.length; i++) {
result |=
a.charCodeAt(i) ^
b.charCodeAt(i);
}

return result === 0;
}

function positiveInteger(value) {
const number = Number.parseInt(value, 10);

if (
!Number.isFinite(number) ||
number < 0
) {
return 0;
}

return number;
}

function json(data, status = 200) {
return new Response(
JSON.stringify(data),
{
status: status,
headers: {
"Content-Type": "application/json"
}
}
);
}
