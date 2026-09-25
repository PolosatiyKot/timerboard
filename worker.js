// ======================================================
// TIMER BOARD — CLOUDFLARE WORKER
// ======================================================

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        try {
            // -----------------------------
            // Авторизация
            // -----------------------------

            if (
                request.method === "POST" &&
                url.pathname === "/api/login"
            ) {
                return await login(request, env);
            }


            // -----------------------------
            // Выход
            // -----------------------------

            if (
                request.method === "POST" &&
                url.pathname === "/api/logout"
            ) {
                return jsonResponse(
                    { success: true },
                    {
                        "Set-Cookie":
                            "session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
                    }
                );
            }


            // -----------------------------
            // Информация о текущей сессии
            // -----------------------------

            if (
                request.method === "GET" &&
                url.pathname === "/api/session"
            ) {
                return await getSession(request, env);
            }


            // -----------------------------
            // Получить таймеры
            // -----------------------------

            if (
                request.method === "GET" &&
                url.pathname === "/api/timers"
            ) {
                return await getTimers(request, env);
            }


            // -----------------------------
            // Создать таймер
            // -----------------------------

            if (
                request.method === "POST" &&
                url.pathname === "/api/timers"
            ) {
                return await createTimer(request, env);
            }


            // -----------------------------
            // Изменить таймер
            // -----------------------------

            if (
                request.method === "PUT" &&
                url.pathname.startsWith("/api/timers/")
            ) {
                const id =
                    url.pathname.split("/").pop();

                return await updateTimer(
                    request,
                    env,
                    id
                );
            }


            // -----------------------------
            // Удалить таймер
            // -----------------------------

            if (
                request.method === "DELETE" &&
                url.pathname.startsWith("/api/timers/")
            ) {
                const id =
                    url.pathname.split("/").pop();

                return await deleteTimer(
                    request,
                    env,
                    id
                );
            }


            // -----------------------------
            // Изменение паролей
            // -----------------------------

            if (
                request.method === "PUT" &&
                url.pathname === "/api/passwords"
            ) {
                return await updatePasswords(
                    request,
                    env
                );
            }


            // -----------------------------
            // Если API не найден
            // -----------------------------

            if (url.pathname.startsWith("/api/")) {
                return jsonResponse(
                    {
                        error: "API endpoint not found"
                    },
                    {},
                    404
                );
            }


            // -----------------------------
            // Статические файлы сайта
            // -----------------------------

            if (env.ASSETS) {
                return env.ASSETS.fetch(request);
            }


            return new Response(
                "Timer Board Worker работает.",
                {
                    status: 200,
                    headers: {
                        "Content-Type":
                            "text/plain; charset=UTF-8"
                    }
                }
            );

        } catch (error) {

            console.error(error);

            return jsonResponse(
                {
                    error:
                        "Внутренняя ошибка сервера."
                },
                {},
                500
            );
        }
    }
};


// ======================================================
// LOGIN
// ======================================================

async function login(request, env) {

    const body =
        await request.json();


    const password =
        String(body.password || "");


    if (!password) {
        return jsonResponse(
            {
                error: "Введите пароль."
            },
            {},
            400
        );
    }


    const admin =
        await getSetting(
            env,
            "admin_password"
        );

    const user =
        await getSetting(
            env,
            "user_password"
        );


    // Администратор
    if (
        admin &&
        await verifyPassword(
            password,
            admin
        )
    ) {

        const session =
            await createSession(
                env,
                "admin"
            );


        return jsonResponse(
            {
                success: true,
                role: "admin"
            },
            {
                "Set-Cookie":
                    createSessionCookie(
                        session
                    )
            }
        );
    }


    // Пользователь
    if (
        user &&
        await verifyPassword(
            password,
            user
        )
    ) {

        const session =
            await createSession(
                env,
                "user"
            );


        return jsonResponse(
            {
                success: true,
                role: "user"
            },
            {
                "Set-Cookie":
                    createSessionCookie(
                        session
                    )
            }
        );
    }


    return jsonResponse(
        {
            error: "Неверный пароль."
        },
        {},
        401
    );
}


// ======================================================
// SESSION
// ======================================================

async function createSession(
    env,
    role
) {

    const id =
        crypto.randomUUID();


    await env.DB.prepare(
        `
        INSERT INTO sessions
        (id, role, created_at)
        VALUES (?, ?, ?)
        `
    )
        .bind(
            id,
            role,
            Date.now()
        )
        .run();


    return id;
}


function createSessionCookie(
    session
) {

    return [
        `session=${session}`,
        "HttpOnly",
        "Secure",
        "SameSite=Strict",
        "Path=/",
        "Max-Age=86400"
    ].join("; ");
}


function getSessionId(request) {

    const cookie =
        request.headers.get("Cookie") || "";


    const match =
        cookie.match(
            /(?:^|;\s*)session=([^;]+)/
        );


    return match
        ? match[1]
        : null;
}


async function getCurrentSession(
    request,
    env
) {

    const id =
        getSessionId(request);


    if (!id) {
        return null;
    }


    const result =
        await env.DB.prepare(
            `
            SELECT id, role
            FROM sessions
            WHERE id = ?
            `
        )
            .bind(id)
            .first();


    return result || null;
}


async function getSession(
    request,
    env
) {

    const session =
        await getCurrentSession(
            request,
            env
        );


    if (!session) {

        return jsonResponse(
            {
                authenticated: false
            }
        );
    }


    return jsonResponse(
        {
            authenticated: true,
            role: session.role
        }
    );
}


// ======================================================
// TIMERS
// ======================================================

async function getTimers(
    request,
    env
) {

    const session =
        await getCurrentSession(
            request,
            env
        );


    if (!session) {
        return unauthorized();
    }


    const result =
        await env.DB.prepare(
            `
            SELECT
                id,
                description,
                days,
                hours,
                minutes,
                seconds,
                remaining_seconds,
                running
            FROM timers
            ORDER BY id ASC
            `
        ).all();


    return jsonResponse(
        {
            timers:
                result.results || []
        }
    );
}


// ======================================================
// CREATE TIMER
// ======================================================

async function createTimer(
    request,
    env
) {

    const session =
        await getCurrentSession(
            request,
            env
        );


    if (!session) {
        return unauthorized();
    }


    const body =
        await request.json();


    const description =
        String(
            body.description || ""
        );


    const days =
        positiveNumber(
            body.days
        );

    const hours =
        positiveNumber(
            body.hours
        );

    const minutes =
        positiveNumber(
            body.minutes
        );

    const seconds =
        positiveNumber(
            body.seconds
        );


    const total =
        days * 86400 +
        hours * 3600 +
        minutes * 60 +
        seconds;


    const result =
        await env.DB.prepare(
            `
            INSERT INTO timers
            (
                description,
                days,
                hours,
                minutes,
                seconds,
                remaining_seconds,
                running
            )
            VALUES (?, ?, ?, ?, ?, ?, 0)
            `
        )
            .bind(
                description,
                days,
                hours,
                minutes,
                seconds,
                total
            )
            .run();


    return jsonResponse(
        {
            success: true,
            id: result.meta.last_row_id
        },
        {},
        201
    );
}


// ======================================================
// UPDATE TIMER
// ======================================================

async function updateTimer(
    request,
    env,
    id
) {

    const session =
        await getCurrentSession(
            request,
            env
        );


    if (!session) {
        return unauthorized();
    }


    const body =
        await request.json();


    const description =
        String(
            body.description || ""
        );


    const days =
        positiveNumber(
            body.days
        );

    const hours =
        positiveNumber(
            body.hours
        );

    const minutes =
        positiveNumber(
            body.minutes
        );

    const seconds =
        positiveNumber(
            body.seconds
        );


    const remaining =
        positiveNumber(
            body.remaining_seconds
        );


    await env.DB.prepare(
        `
        UPDATE timers
        SET
            description = ?,
            days = ?,
            hours = ?,
            minutes = ?,
            seconds = ?,
            remaining_seconds = ?,
            running = ?
        WHERE id = ?
        `
    )
        .bind(
            description,
            days,
            hours,
            minutes,
            seconds,
            remaining,
            body.running ? 1 : 0,
            id
        )
        .run();


    return jsonResponse(
        {
            success: true
        }
    );
}


// ======================================================
// DELETE TIMER
// ======================================================

async function deleteTimer(
    request,
    env,
    id
) {

    const session =
        await getCurrentSession(
            request,
            env
        );


    if (!session) {
        return unauthorized();
    }


    await env.DB.prepare(
        `
        DELETE FROM timers
        WHERE id = ?
        `
    )
        .bind(id)
        .run();


    return jsonResponse(
        {
            success: true
        }
    );
}


// ======================================================
// PASSWORDS
// ======================================================

async function updatePasswords(
    request,
    env
) {

    const session =
        await getCurrentSession(
            request,
            env
        );


    if (
        !session ||
        session.role !== "admin"
    ) {
        return forbidden();
    }


    const body =
        await request.json();


    const newAdmin =
        String(
            body.admin_password || ""
        ).trim();


    const newUser =
        String(
            body.user_password || ""
        ).trim();


    if (
        !newAdmin &&
        !newUser
    ) {

        return jsonResponse(
            {
                error:
                    "Необходимо указать хотя бы один пароль."
            },
            {},
            400
        );
    }


    if (newAdmin) {

        const hash =
            await hashPassword(
                newAdmin
            );


        await setSetting(
            env,
            "admin_password",
            hash
        );
    }


    if (newUser) {

        const hash =
            await hashPassword(
                newUser
            );


        await setSetting(
            env,
            "user_password",
            hash
        );
    }


    return jsonResponse(
        {
            success: true
        }
    );
}


// ======================================================
// PASSWORD HASHING
// ======================================================

async function hashPassword(
    password
) {

    const data =
        new TextEncoder()
            .encode(password);


    const hash =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );


    return [...new Uint8Array(hash)]
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
        )
        .join("");
}


async function verifyPassword(
    password,
    hash
) {

    const calculated =
        await hashPassword(
            password
        );


    return calculated === hash;
}


// ======================================================
// DATABASE SETTINGS
// ======================================================

async function getSetting(
    env,
    key
) {

    const result =
        await env.DB.prepare(
            `
            SELECT value
            FROM settings
            WHERE key = ?
            `
        )
            .bind(key)
            .first();


    return result
        ? result.value
        : null;
}


async function setSetting(
    env,
    key,
    value
) {

    await env.DB.prepare(
        `
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value
        `
    )
        .bind(
            key,
            value
        )
        .run();
}


// ======================================================
// HELPERS
// ======================================================

function positiveNumber(
    value
) {

    const number =
        Number(value);


    if (
        !Number.isFinite(number) ||
        number < 0
    ) {
        return 0;
    }


    return Math.floor(number);
}


function jsonResponse(
    data,
    extraHeaders = {},
    status = 200
) {

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json; charset=UTF-8",

                ...extraHeaders
            }
        }
    );
}


function unauthorized() {

    return jsonResponse(
        {
            error:
                "Необходима авторизация."
        },
        {},
        401
    );
}


function forbidden() {

    return jsonResponse(
        {
            error:
                "Недостаточно прав."
        },
        {},
        403
    );
}
