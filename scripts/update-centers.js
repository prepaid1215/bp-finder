const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { applyCenterOverrides } = require("./center-overrides");

const API_URL =
  "https://lgusobija.n-telecom.co.kr/common/component/info/AjaxAgcdInfo.aspx";

const PAGE_URL =
  "https://lgusobija.n-telecom.co.kr/view/merge/info/AgcdInfo_pc.aspx";

const OUTPUT_FILE = path.join(
  process.cwd(),
  "data",
  "centers.json"
);

const HQ_FILE = path.join(process.cwd(), "data", "hq.json");
const OVERRIDES_FILE = path.join(process.cwd(), "data", "center-overrides.json");

// 본사처럼 홈페이지 목록에 없지만 센터 업무를 하는 곳 (data/hq.json 수동 관리)
function loadExtraCenters() {
  if (!fs.existsSync(HQ_FILE)) return [];
  const list = JSON.parse(fs.readFileSync(HQ_FILE, "utf8"));
  return Array.isArray(list) ? list : [];
}

const REGIONS = [
  { code: "J01", name: "서울" },
  { code: "J06", name: "경기" },
  { code: "J03", name: "인천" },
  { code: "J07", name: "강원" },
  { code: "J04", name: "대전" },
  { code: "J15", name: "광주" },
  { code: "J11", name: "전남" },
  { code: "J10", name: "전북" },
  { code: "J09", name: "충남" },
  { code: "J08", name: "충북" },
  { code: "J05", name: "대구" },
  { code: "J12", name: "경북" },
  { code: "J16", name: "울산" },
  { code: "J02", name: "부산" },
  { code: "J13", name: "경남" },
  { code: "J14", name: "제주" }
];

function clean(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCenter(item, region) {
  return {
    id: clean(item.CNT_CD),
    name: clean(item.CNT_NAME),
    regionCode: region.code,
    region: region.name,
    phone: clean(item.TEL),
    fax: clean(item.FAX),
    address1: clean(item.ADDR1),
    address2: clean(item.ADDR2),
    address: clean(`${item.ADDR1 ?? ""} ${item.ADDR2 ?? ""}`),
    latitude: clean(item.CNT_X),
    longitude: clean(item.CNT_Y),
    isCenter: clean(item.CENTERYN) === "Y"
  };
}

async function fetchRegion(region) {
  const payload = {
    header: [
      {
        type: "01"
      }
    ],
    body: [
      {
        area_cd: region.code,
        agnm: "",
        key: ""
      }
    ]
  };

  const response = await axios.post(
    API_URL,
    JSON.stringify(payload),
    {
      timeout: 30000,
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
        Referer: PAGE_URL,
        Origin: "https://lgusobija.n-telecom.co.kr",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01"
      }
    }
  );

  const result =
    typeof response.data === "string"
      ? JSON.parse(response.data)
      : response.data;

  if (!result || result.RESULT !== "Y") {
    throw new Error(
      `${region.name} 조회 실패: ${
        result?.RESULTMSG || result?.RESULT || "응답 오류"
      }`
    );
  }

  const rows = Array.isArray(result.DATA)
    ? result.DATA
    : [];

  return rows.map((item) =>
    normalizeCenter(item, region)
  );
}

async function main() {
  const allCenters = [];

  for (const region of REGIONS) {
    console.log(`${region.name} 조회 중...`);

    const centers = await fetchRegion(region);

    console.log(
      `${region.name}: ${centers.length}개`
    );

    allCenters.push(...centers);

    await new Promise((resolve) =>
      setTimeout(resolve, 300)
    );
  }

  const uniqueCenters = Array.from(
    new Map(
      allCenters.map((center) => [
        center.id ||
          `${center.name}|${center.phone}|${center.address}`,
        center
      ])
    ).values()
  );

  uniqueCenters.sort((a, b) => {
    const regionCompare =
      REGIONS.findIndex(
        (region) => region.code === a.regionCode
      ) -
      REGIONS.findIndex(
        (region) => region.code === b.regionCode
      );

    if (regionCompare !== 0) {
      return regionCompare;
    }

    return a.name.localeCompare(
      b.name,
      "ko-KR"
    );
  });

    const MIN_CENTER_COUNT = 50;
  let previousCount = 0;

  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const previousData = JSON.parse(
        fs.readFileSync(OUTPUT_FILE, "utf8")
      );

      const prevExtra = (previousData.centers || []).filter((c) => c.isHQ).length;
      previousCount = Number(previousData.count || 0) - prevExtra;
    } catch (error) {
      console.warn("기존 centers.json 확인 실패");
    }
  }

  // 센터가 50개 미만이면 기존 파일 유지
  if (uniqueCenters.length < MIN_CENTER_COUNT) {
    throw new Error(
      `센터 수 이상 감지: ${uniqueCenters.length}개. 기존 파일을 유지합니다.`
    );
  }

  // 기존보다 30% 이상 감소하면 기존 파일 유지
  if (
    previousCount > 0 &&
    uniqueCenters.length < previousCount * 0.7
  ) {
    throw new Error(
      `센터 수 급감 감지: ${previousCount}개 → ${uniqueCenters.length}개. 기존 파일을 유지합니다.`
    );
  }
  
  // One center can retain user-confirmed details until the official feed catches up.
  // When phone, fax, address and nearby coordinates match, automatically retire
  // that manual correction and return to the original, freshly scraped row.
  const overrideRegistry = fs.existsSync(OVERRIDES_FILE)
    ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8"))
    : { overrides: {} };
  const { centers: correctedCenters, appliedIds, releasedIds, nextRegistry } =
    applyCenterOverrides(uniqueCenters, overrideRegistry);
  if (appliedIds.length) console.log("임시 보정 적용:", appliedIds.join(", "));
  if (releasedIds.length) {
    console.log("본사 데이터 일치: 임시 보정 해제 → 본사 자동 수집 사용:", releasedIds.join(", "));
    // GitHub Actions commits this file with the regenerated centers.json,
    // so the retired override cannot reappear on a later official-feed change.
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(nextRegistry, null, 2) + "\n", "utf8");
  }

  // 검증 통과 후 본사 등 수동 관리 센터를 맨 앞에 합침
  const extraCenters = loadExtraCenters();
  const finalCenters = [...extraCenters, ...correctedCenters];

  const output = {
    updatedAt: new Date().toISOString(),
    source: PAGE_URL,
    api: API_URL,
    count: finalCenters.length,
    centers: finalCenters
  };

  fs.mkdirSync(
    path.dirname(OUTPUT_FILE),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log(
    `완료: 총 ${finalCenters.length}개 센터 저장 (본사 등 수동 ${extraCenters.length}개 포함)`
  );
}

main().catch((error) => {
  console.error("센터정보 업데이트 실패");
  console.error(
    error.response?.data || error.message
  );
  process.exit(1);
});
