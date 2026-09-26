async function fetchHandler(request, env) {
try {
return new Response(
JSON.stringify({
ok: true,
DB: typeof env.DB,
ASSETS: typeof env.ASSETS,
INITIAL_ADMIN_PASSWORD:
typeof env.INITIAL_ADMIN_PASSWORD,
INITIAL_USER_PASSWORD:
typeof env.INITIAL_USER_PASSWORD,
INITIAL_VIEWER_PASSWORD:
typeof env.INITIAL_VIEWER_PASSWORD
}),
{
status: 200,
headers: {
"Content-Type": "application/json"
}
}
);
} catch (error) {
return new Response(
JSON.stringify({
error: String(error?.message || error)
}),
{
status: 500,
headers: {
"Content-Type": "application/json"
}
}
);
}
}

export default {
fetch: fetchHandler
};
