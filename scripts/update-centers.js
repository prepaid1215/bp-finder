const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const SOURCE_URL =
  "https://info.n-telecom.co.kr/products/center_info.jsp";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "data",
  "centers.json"
);

function cleanText(value = "") {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const response = await axios.get(SOURCE_URL, {
    timeout: 30000,
    responseType: "arraybuffer",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      Referer: "https://info.n-telecom.co.kr/"
    }
  });

  const html = Buffer.from(response.data).toString("utf8");
  const $ = cheerio.load(html);

  const centers = [];

  $("table tbody tr, table tr").each((_, row) => {
    const cells = $(row)
      .find("th, td")
      .map((__, cell) => cleanText($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length < 2) return;

    const combined = cells.join(" | ");

    if (
      combined.includes("센터명") ||
      combined.includes("지역") &&
      combined.includes("주소")
    ) {
      return;
    }

    centers.push({
      values: cells
    });
  });

  if (centers.length === 0) {
    throw new Error(
      "센터정보를 찾지 못했습니다. 원본 페이지 구조가 다르거나 요청이 차단되었습니다."
    );
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    count: centers.length,
    centers
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), {
    recursive: true
  });

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log(`${centers.length}개 행을 저장했습니다.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
