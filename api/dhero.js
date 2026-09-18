/**
 * Vercel Serverless Function
 * POST /api/dhero
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

  const addr = String(input?.addr || '').trim();
  const zipcd = String(input?.zipcd || '').trim();

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

  const payload = {
    header: [{ type: '01' }],
    body: [{ addr, zipcd }]
  };

  const controller = new AbortController();
  const timeoutMs = 20000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetch(
      'https://www.n-telecom.co.kr/common/component/dHero/AjaxDHeroAPI.aspx',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'User-Agent': 'bp-finder-delivery-check/1.1'
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: controller.signal
      }
    );

    const raw = await upstream.text();

    if (!upstream.ok) {
      return res.status(502).json({
        ok: false,
        message: '배송판정 서버가 정상 응답하지 않았습니다.',
        upstreamStatus: upstream.status,
        region: process.env.VERCEL_REGION || null
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return res.status(502).json({
        ok: false,
        message: '배송판정 응답 형식을 확인하지 못했습니다.',
        region: process.env.VERCEL_REGION || null
      });
    }

    if (!data || typeof data.RESULT === 'undefined') {
      return res.status(502).json({
        ok: false,
        message: '배송판정 결과값이 없습니다.',
        region: process.env.VERCEL_REGION || null
      });
    }

    return res.status(200).json({
      ok: true,
      data: {
        RESULT: String(data.RESULT ?? ''),
        RESULTMSG: String(data.RESULTMSG ?? '')
      },
      region: process.env.VERCEL_REGION || null
    });
  } catch (error) {
    const isTimeout = error && error.name === 'AbortError';

    return res.status(502).json({
      ok: false,
      message: isTimeout
        ? '배송판정 서버 응답 시간이 초과되었습니다.'
        : '배송판정 서버에 연결하지 못했습니다.',
      region: process.env.VERCEL_REGION || null,
      timeoutMs
    });
  } finally {
    clearTimeout(timeout);
  }
};
