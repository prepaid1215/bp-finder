"use strict";
const assert = require("node:assert/strict");
const { applyCenterOverrides } = require("./center-overrides");
const registry = require("../data/center-overrides.json");
const officialOld = {
  id:"5330", name:"대구글로벌BP",
  phone:"053-588-3016", fax:"053-323-3055",
  address1:"대구광역시 달서구 계대동문로4길 72(신당동)",
  address2:"1층 101호",
  address:"대구광역시 달서구 계대동문로4길 72(신당동) 1층 101호",
  latitude:"35.852270", longitude:"128.493913"
};
const unrelated = {
  id:"1315", name:"가산역BP", phone:"02-000-0000", address1:"서울 금천구",
  latitude:"37.4", longitude:"126.9"
};
const old = applyCenterOverrides([officialOld, unrelated], registry);
assert.deepEqual(old.appliedIds, ["5330"]);
assert.deepEqual(old.releasedIds, []);
assert.equal(old.centers[0].phone, "010-2665-0111");
assert.equal(old.centers[0].address, "대구광역시 북구 매전로 50 1층");
assert.equal(old.centers[0].fax, "053-323-3055");
assert.deepEqual(old.centers[1], unrelated);
assert.equal(officialOld.phone, "053-588-3016"); // never mutate scraped source
assert.ok(old.nextRegistry.overrides["5330"]);

const current = registry.overrides["5330"];
const updatedHQ = {
  ...officialOld,
  phone: "010-2665-0111", fax: "0533233055",
  address1: "대구광역시 북구 매전로 50(태전동)",
  address2: "1층", latitude: "35.91011", longitude: "128.54701"
};
const release = applyCenterOverrides([updatedHQ, unrelated], registry);
assert.deepEqual(release.releasedIds, ["5330"]);
assert.deepEqual(release.appliedIds, []);
assert.equal(release.centers[0].address1, updatedHQ.address1);
assert.equal(release.nextRegistry.overrides["5330"], undefined);

const wrongCoordinates = applyCenterOverrides([
  { ...updatedHQ, latitude: "35.852270", longitude: "128.493913" }
], registry);
assert.deepEqual(wrongCoordinates.appliedIds, ["5330"]);
assert.deepEqual(wrongCoordinates.releasedIds, []);
assert.ok(current.coordinateApproximate);
console.log("센터 임시 보정/본사 일치 시 자동 복귀 테스트 통과");
