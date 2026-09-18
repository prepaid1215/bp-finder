/**
 * Vercel Serverless Function
 * POST /api/dhero
 *
 * 입력:
 * { "addr": "전남 여수시 가곡길 6", "zipcd": "59634" }
 *
 * N텔레콤 배송판정 API에 서버-대-서버 요청 후 RESULT / RESULTMSG 반환.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      message: 'POST 요청만 허용됩니다.'
    });
  }

  let input = req.body;

  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch (_) {
      return res.status(400).json({
        ok: false,
        message: '잘못된 요청 형식입니다.'
      });
    }
  }

  if (!input || typeof input !== 'object') {
    return res.status(400).json({
      ok: false,
      message: '잘못된 요청 형식입니다.'
    });
  }

  const addr = String(input.addr || '').trim();
  const zipcd = String(input.zipcd || '').trim();

  if (addr.length < 4 || addr.length > 160) {
    return res.status(400).json({
      ok: false,
      message: '주소 형식이 올바르지 않습니다.'
    });
  }

  if (!/^\d{5}$/.test(zipcd)) {
    return res.status(400).json({
      ok: false,
      message: '5자리 우편번호가 필요합니다.'
    });
  }

  const upstreamPayload = {
    header: [
      { type: '01' }
    ],
    body: [
      {
        addr,
        zipcd
      }
    ]
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(
      'https://www.n-telecom.co.kr/common/component/dHero/AjaxDHeroAPI.aspx',
      {
        method: 'POST',
        headers: {
          // 실제 N텔레콤 요청과 동일하게 Content-Type은 form-urlencoded,
          // 본문 자체는 JSON 문자열로 전송한다.
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Cache-Control': 'no-cache',
          'User-Agent': 'bp-finder-delivery-check/1.0'
        },
        body: JSON.stringify(upstreamPayload),
        cache: 'no-store',
        signal: controller.signal
      }
    );

    const raw = await upstream.text();

    if (!upstream.ok) {
      return res.status(502).json({
        ok: false,
        message: '배송판정 서버가 정상 응답하지 않았습니다.',
        upstreamStatus: upstream.status
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return res.status(502).json({
        ok: false,
        message: '배송판정 응답 형식을 확인하지 못했습니다.'
      });
    }

    if (!data || typeof data.RESULT === 'undefined') {
      return res.status(502).json({
        ok: false,
        message: '배송판정 결과값이 없습니다.'
      });
    }

    return res.status(200).json({
      ok: true,
      data: {
        RESULT: String(data.RESULT ?? ''),
        RESULTMSG: String(data.RESULTMSG ?? '')
      }
    });
  } catch (error) {
    const isTimeout = error && error.name === 'AbortError';

    return res.status(502).json({
      ok: false,
      message: isTimeout
        ? '배송판정 서버 응답 시간이 초과되었습니다.'
        : '배송판정 서버에 연결하지 못했습니다.'
    });
  } finally {
    clearTimeout(timeout);
  }
};
