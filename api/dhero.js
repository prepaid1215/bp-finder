/**
 * BP FINDER Vercel proxy
 * POST /api/dhero
 *
 * Vercel -> preplan.site 국내 PHP proxy -> N텔레콤 배송판정 API
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

  const controller = new AbortController();
  const timeoutMs = 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetch(
      'https://preplan.site/wp-content/themes/59%EB%A7%8C%EB%AA%A8%EB%B0%94%EC%9D%BC/dhero-proxy.php',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ addr, zipcd }),
        cache: 'no-store',
        signal: controller.signal
      }
    );

    const raw = await upstream.text();

    if (!upstream.ok) {
      return res.status(502).json({
        ok: false,
        message: '중계 서버가 정상 응답하지 않았습니다.',
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
        message: '중계 서버 응답 형식을 확인하지 못했습니다.',
        region: process.env.VERCEL_REGION || null
      });
    }

    if (!data || data.ok !== true || !data.data) {
      return res.status(502).json({
        ok: false,
        message: data?.message || '배송판정 결과를 받지 못했습니다.',
        region: process.env.VERCEL_REGION || null
      });
    }

    return res.status(200).json({
      ok: true,
      data: {
        RESULT: String(data.data.RESULT ?? ''),
        RESULTMSG: String(data.data.RESULTMSG ?? '')
      },
      region: process.env.VERCEL_REGION || null,
      via: 'preplan'
    });
  } catch (error) {
    const isTimeout = error && error.name === 'AbortError';

    return res.status(502).json({
      ok: false,
      message: isTimeout
        ? '중계 서버 응답 시간이 초과되었습니다.'
        : '중계 서버에 연결하지 못했습니다.',
      region: process.env.VERCEL_REGION || null,
      timeoutMs
    });
  } finally {
    clearTimeout(timeout);
  }
};
