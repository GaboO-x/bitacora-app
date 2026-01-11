import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const CFG_KEY = "bitacora_cfg_v1";

export function getCfg() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY) || "null"); } catch { return null; }
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
  return createClient(cfg.url, cfg.anon);
}

export async function requireSession() {
  const supabase = await ensureSupabase();
  if (!supabase) return { supabase: null, session: null };
  const { data } = await supabase.auth.getSession();
  return { supabase, session: data.session };
}

export async function getMyProfile(supabase, userId) {
  // Use limit(1) + maybeSingle() to avoid PostgREST "Cannot coerce..." errors if duplicates exist.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, division, squad_code, active")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (error) return { profile: null, error };
  return { profile: data, error: null };
}

export async function callInviteEdge(supabase, payload) {
  // The active Edge Function is "bright-task". Payload must include "email" at root level.
  const { data, error } = await supabase.functions.invoke("bright-task", { body: payload });
  return { data, error };
}
