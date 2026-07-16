// Thin fetch wrapper for the backend. All calls include cookies (session auth).
let cachedUser = null;

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function signup(username, password) {
  const data = await request("POST", "/api/auth/signup", { username, password });
  cachedUser = data.user;
  return data.user;
}

export async function login(username, password) {
  const data = await request("POST", "/api/auth/login", { username, password });
  cachedUser = data.user;
  return data.user;
}

export async function logout() {
  await request("POST", "/api/auth/logout");
  cachedUser = null;
}

export async function fetchMe() {
  try {
    const data = await request("GET", "/api/auth/me");
    cachedUser = data.user;
    return data.user;
  } catch {
    cachedUser = null;
    return null;
  }
}

export function currentUser() {
  return cachedUser;
}

export function isLoggedIn() {
  return !!cachedUser;
}

export async function getCollection() {
  return (await request("GET", "/api/collection")).collection;
}

export async function listServerDecks() {
  return (await request("GET", "/api/decks")).decks;
}

export async function saveServerDeck(deck) {
  return request("POST", "/api/decks", deck);
}

export async function deleteServerDeck(id) {
  return request("DELETE", `/api/decks/${id}`);
}

export async function openPack() {
  const data = await request("POST", "/api/packs/open");
  cachedUser = cachedUser ? { ...cachedUser, packPoints: data.packPoints } : cachedUser;
  return data;
}

export async function reportGameResult(result) {
  const data = await request("POST", "/api/packs/report-result", { result });
  cachedUser = cachedUser ? { ...cachedUser, packPoints: data.packPoints } : cachedUser;
  return data.packPoints;
}

export async function redeemCode(code) {
  const data = await request("POST", "/api/codes/redeem", { code });
  cachedUser = cachedUser ? { ...cachedUser, packPoints: data.packPoints } : cachedUser;
  return data;
}

export async function sendHeartbeat(screen) {
  if (!cachedUser) return;
  try {
    const data = await request("POST", "/api/packs/heartbeat", { screen });
    cachedUser = { ...cachedUser, packPoints: data.packPoints };
  } catch {
    /* heartbeat failures are non-critical */
  }
}
