import crypto from "node:crypto";

const TABLE = "bp_center_feedback";
const CHANNELS = new Set(["fax", "kakao", "both", "other", "unknown"]);
const VALID_ID = /^(?:HQ|[0-9]{2,8})$/;

function send(res, status, payload) {
  res.status(status).json(payload);
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  // Prefer modern Supabase secret keys; legacy service_role keys remain supported.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const salt = process.env.FEEDBACK_HASH_SALT;
  const legacy = key && !key.startsWith("sb_secret_");
  return url && key && salt ? { url, key, salt, legacy } : null;
}

async function db(config, query, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${TABLE}${query}`, {
    ...options,
    headers: {
      apikey: config.key,
      // sb_secret_* keys are not JWTs: send them only as apikey.
      ...(config.legacy ? { Authorization: `Bearer ${config.key}` } : {}),
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  if (!response.ok) {
    // DB errors and credentials are not returned to the public user.
    console.error("Center feedback database request failed", response.status);
    throw new Error("DATABASE_ERROR");
  }
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Allow", "GET, POST");
  if (!["GET", "POST"].includes(req.method)) return send(res, 405, { error: "허용되지 않은 요청입니다." });

  const cfg = config();
  if (!cfg) return send(res, 503, { error: "센터 후기 기능이 아직 설정되지 않았습니다." });

  try {
    if (req.method === "GET") {
      const centerId = String(req.query.centerId || "");
      if (!VALID_ID.test(centerId)) return send(res, 400, { error: "센터를 확인해 주세요." });
      const query = `?center_id=eq.${encodeURIComponent(centerId)}&status=eq.approved&select=channel,channel_detail,hours,hours_detail,visit_date,note,created_at&order=created_at.desc&limit=30`;
      const rows = await db(cfg, query);
      return send(res, 200, { comments: rows || [] });
    }

    const origin = req.headers.origin;
    const host = req.headers.host;
    if (origin && (!host || new URL(origin).host !== host)) {
      return send(res, 403, { error: "다른 사이트에서는 등록할 수 없습니다." });
    }
    if (Number(req.headers["content-length"] || 0) > 4096) {
      return send(res, 413, { error: "내용이 너무 깁니다." });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const centerId = String(body.centerId || "");
    const centerName = String(body.centerName || "").trim();
    const requesterName = String(body.requesterName || "").trim();
    const channel = String(body.channel || "");
    const channelDetail = String(body.channelDetail || "").trim();
    const hoursDetail = String(body.hoursDetail || "").trim();
    const note = String(body.note || "").trim();
    const visitDate = body.visitDate ? String(body.visitDate) : null;
    const website = String(body.website || "").trim(); // honeypot

    if (website) return send(res, 202, { submitted: true, approved: false });
    if (!VALID_ID.test(centerId) || !CHANNELS.has(channel)) {
      return send(res, 400, { error: "센터와 선택 항목을 확인해 주세요." });
    }
    if (requesterName.length < 2 || requesterName.length > 50 || /[<>\u0000-\u001f]/.test(requesterName)) return send(res, 400, { error:"요청자 성명을 2~50자로 입력해 주세요." });
    if (centerName.length > 100 || /[<>\u0000-\u001f]/.test(centerName)) return send(res, 400, {error:"센터명 형식을 확인해 주세요."});
    if (channelDetail.length > 80 || (channel === "other" && channelDetail.length < 2) || hoursDetail.length > 200) return send(res, 400, {error:"입력 항목 길이를 확인해 주세요."});
    if (note.length < 5 || note.length > 400) {
      return send(res, 400, { error: "경험 내용을 5~400자로 작성해 주세요." });
    }
    if (visitDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
        return send(res, 400, { error: "날짜 형식을 확인해 주세요." });
      }
      const date = new Date(visitDate + "T00:00:00Z");
      const todayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
      const ageDays = (Date.parse(todayKst) - date.getTime()) / 86400000;
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== visitDate || ageDays < 0 || ageDays > 366) {
        return send(res, 400, { error: "최근 1년 이내의 경험 날짜를 입력해 주세요." });
      }
    }

    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
    const ipHash = crypto.createHash("sha256").update(cfg.salt + ":" + ip).digest("hex");
    const since = new Date(Date.now() - 86400000).toISOString();
    const existing = await db(cfg, `?ip_hash=eq.${ipHash}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=20`);
    if (existing.length >= 20) return send(res, 429, { error: "같은 IP에서 최근 24시간 동안 20건이 등록되었습니다. 이후 다시 이용해 주세요." });

    await db(cfg, "", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        center_id: centerId,
        center_name: centerName || null,
        requester_name: requesterName,
        channel, hours:"unknown", stage:null,
        channel_detail:channel === "other" ? channelDetail : null,
        hours_detail:hoursDetail || null,
        visit_date: visitDate,
        note,
        ip_hash: ipHash,
        status: "approved"
      })
    });
    return send(res, 201, { submitted: true, approved: true, message: "등록되었습니다. 다른 사용자에게 바로 공개됩니다." });
  } catch (error) {
    console.error("Center feedback API error", error?.message);
    return send(res, 500, { error: "잠시 후 다시 시도해 주세요." });
  }
}
