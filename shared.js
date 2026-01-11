import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG_KEY = "bitacora_cfg_v1";

/**
 * Lee configuración (Project URL + anon key) desde localStorage.
 */
export function getCfg() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || "null");
  } catch {
    return null;
  }
}

/**
 * Guarda configuración (Project URL + anon key) en localStorage.
 */
export function saveCfg(url, anon) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon }));
}

/**
 * Muestra mensajes en un elemento (por id).
 */
export function setMsg(elId, text, isErr = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (isErr ? "err" : "ok");
}

/**
 * Crea el cliente Supabase si existe configuración.
 */
export async function ensureSupabase() {
  const cfg = getCfg();
  if (!cfg?.url || !cfg?.anon) return null;
  return createClient(cfg.url, cfg.anon);
}

/**
 * Requiere sesión activa; devuelve supabase+session (o nulls).
 */
export async function requireSession() {
  const supabase = await ensureSupabase();
  if (!supabase) return { supabase: null, session: null };
  const { data } = await supabase.auth.getSession();
  return { supabase, session: data.session };
}

/**
 * Obtiene el perfil del usuario actual.
 * Nota: usamos limit(1) para evitar el error "Cannot coerce the result to a single JSON object"
 * si existieran duplicados en profiles por mala data histórica.
 */
export async function getMyProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, division, squad_code, active")
    .eq("id", userId)
    .limit(1)
    .single();

  if (error) return { profile: null, error };
  return { profile: data, error: null };
}

/**
 * Invita un usuario a través de la Edge Function "bright-task".
 * Requiere que el body tenga el email en el nivel raíz: { email: "x@dominio.com", ... }
 */
export async function callInviteEdge(supabase, payload) {
  // Acepta callInviteEdge(supabase, "email@dominio.com")
  let body = payload;
  if (typeof body === "string") body = { email: body };

  // Acepta callInviteEdge(supabase, {payload:{...}}) por compatibilidad
  if (body?.payload && !body.email) body = body.payload;

  body = { ...(body || {}) };

  const { data, error } = await supabase.functions.invoke("bright-task", { body });
  return { data, error };
}
