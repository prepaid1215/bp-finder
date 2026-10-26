// BP FINDER shared center feedback API.
// Requires a public publishable API key header, but does not identify end users.
// All data access uses a server-only secret key; unapproved notes remain private.
const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const publicKey = keys.default || Deno.env.get("SUPABASE_ANON_KEY") || "";
const adminKey = secrets.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CHANNELS = new Set(["fax","kakao","both","other","unknown"]);
const HOURS = new Set(["ontime","late","irregular","closed","unknown"]);
const STAGES = new Set(["prepared","submitted","confirmed","visited"]);
const CENTER_ID = /^(?:HQ|[0-9]{2,8})$/;
const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":"apikey,content-type",
  "Access-Control-Max-Age":"86400",
  "Cache-Control":"no-store"
};
function reply(status:number, body:unknown) {
  return new Response(JSON.stringify(body), { status, headers:{ ...CORS, "Content-Type":"application/json; charset=utf-8" } });
}
async function database(path:string, init:RequestInit = {}) {
  const response = await fetch(PROJECT_URL + "/rest/v1/bp_center_feedback" + path, {
    ...init,
    headers: {
      "apikey":adminKey,
      ...(adminKey.startsWith("sb_secret_") ? {} : {"Authorization":"Bearer " + adminKey}),
      "Content-Type":"application/json",
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    console.error("feedback db status",response.status);
    throw new Error("database unavailable");
  }
  if (response.status === 204) return null;
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
function validDate(value:unknown): value is string {
  if (value === null || value === "" || value === undefined) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) return false;
  const todayKst = new Date(Date.now() + 9*3600000).toISOString().slice(0,10);
  const ageDays = (Date.parse(todayKst) - Date.parse(value)) / 86400000;
  return ageDays >= 0 && ageDays <= 366;
}
async function digest(text:string) {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map(n => n.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async (request:Request) => {
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method !== "GET" && request.method !== "POST") return reply(405,{error:"허용되지 않은 요청입니다."});
  if (!PROJECT_URL || !publicKey || !adminKey) return reply(503,{error:"서버 설정을 확인해 주세요."});
  if (request.headers.get("apikey") !== publicKey) return reply(401,{error:"접근 권한을 확인해 주세요."});
  try {
    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("centerId") || "";
      if (!CENTER_ID.test(id)) return reply(400,{error:"센터를 확인해 주세요."});
      const query = "?center_id=eq." + encodeURIComponent(id) +
        "&status=eq.approved&select=channel,hours,stage,visit_date,note,created_at&order=created_at.desc&limit=30";
      return reply(200,{comments: (await database(query)) || []});
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 4096) return reply(413,{error:"내용이 너무 깁니다."});
    const raw = await request.text();
    if (raw.length > 4096) return reply(413,{error:"내용이 너무 깁니다."});
    let data:Record<string,unknown>;
    try { data = JSON.parse(raw); } catch { return reply(400,{error:"잘못된 요청입니다."}); }
    if (typeof data !== "object" || !data || Array.isArray(data)) return reply(400,{error:"잘못된 요청입니다."});
    if (String(data.website || "").trim()) return reply(202,{submitted:true,pending:true});
    const centerId = String(data.centerId || "");
    const channel = String(data.channel || "");
    const hours = String(data.hours || "");
    const stage = String(data.stage || "");
    const note = String(data.note || "").trim();
    const visitDate = data.visitDate == null || data.visitDate === "" ? null : data.visitDate;
    if (!CENTER_ID.test(centerId) || !CHANNELS.has(channel) || !HOURS.has(hours) || !STAGES.has(stage)) {
      return reply(400,{error:"센터와 선택 항목을 확인해 주세요."});
    }
    if (note.length < 5 || note.length > 400 || !validDate(visitDate)) {
      return reply(400,{error:"5~400자 내용과 최근 1년 이내의 날짜를 확인해 주세요."});
    }
    const ip = (request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") || "").split(",")[0].trim();
    if (!ip) return reply(503,{error:"요청 정보를 확인할 수 없습니다."});
    const todayKst = new Date(Date.now() + 9*3600000).toISOString().slice(0,10);
    // Daily rotating pseudonymous fingerprint; do not store the raw IP.
    const hash = await digest("bp-feedback:v1:" + adminKey + ":" + todayKst + ":" + ip);
    const existing = await database("?ip_hash=eq." + hash + "&select=id&limit=3");
    if (existing.length >= 3) return reply(429,{error:"오늘의 등록 가능 횟수를 초과했습니다."});
    await database("", {
      method:"POST",
      headers:{"Prefer":"return=minimal"},
      body:JSON.stringify({
        center_id:centerId, channel, hours, stage,
        visit_date:visitDate, note,
        ip_hash:hash, status:"pending"
      })
    });
    return reply(201,{submitted:true,pending:true,message:"접수 경험이 등록됐습니다. 관리자 확인 후 공개됩니다."});
  } catch(error) {
    console.error("feedback handler failed",error instanceof Error ? error.message : "unknown");
    return reply(503,{error:"현재 코멘트를 처리할 수 없습니다. 잠시 후 다시 시도해 주세요."});
  }
});
