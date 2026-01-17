import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const CFG_KEY = "bitacora_cfg_v1";

// Cachea el cliente en memoria para evitar crear múltiples instancias por página.
let _supabaseClient = null;

export function getCfg() {
  // 1) Prefer saved localStorage config (useful for dev/override)
  try {
    const stored = JSON.parse(localStorage.getItem(CFG_KEY) || "null");
    if (stored?.url && stored?.anon) return stored;
  } catch {}

  // 2) Fallback to repo-shipped config (recommended for end-users)
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    return { url: SUPABASE_URL, anon: SUPABASE_ANON_KEY };
  }

  return null;
}

export function saveCfg(url, anon) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ url, anon }));
}

export function setMsg(elId, text, isErr) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text || "";
  el.className = "msg " + (isErr ? "err" : "ok");
}

export async function ensureSupabase() {
  const cfg = getCfg();
  if (!cfg?.url || !cfg?.anon) return null;

  // Reusa si ya existe y coincide con la config actual.
  if (_supabaseClient && _supabaseClient.__cfg_url === cfg.url && _supabaseClient.__cfg_anon === cfg.anon) {
    return _supabaseClient;
  }

  const client = createClient(cfg.url, cfg.anon);
  // Marcas internas para validar reuso.
  client.__cfg_url = cfg.url;
  client.__cfg_anon = cfg.anon;
  _supabaseClient = client;
  return client;
}

export async function requireSession() {
  const supabase = await ensureSupabase();
  if (!supabase) return { supabase: null, session: null };
  const { data } = await supabase.auth.getSession();
  return { supabase, session: data.session };
}

export async function getMyProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, division, squad_code, active")
    .eq("id", userId)
    .single();
  if (error) return { profile: null, error };
  return { profile: data, error: null };
}

export async function callInviteEdge(supabase, adminEmail, adminPassword, payload) {
  const { data, error } = await supabase.functions.invoke("bright-task", {
    body: {
      email: payload.email,
      full_name: payload.full_name,
      // assignment fields (expected by the Edge Function)
      role: payload.role,
      divisions: payload.divisions,
      squads: payload.squads,
      // backward-compatible single fields
      division: payload.division ?? null,
      squad_code: payload.squad_code ?? null,
    },
  });
  return { data, error };
}
