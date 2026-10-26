"use strict";

const ADDRESS_FIELDS = ["address1", "address2"];
const CONTACT_FIELDS = ["phone", "fax"];
const OVERRIDE_FIELDS = ["address1", "address2", "phone", "fax", "latitude", "longitude", "coordinateApproximate"];
const MAX_COORDINATE_DRIFT_METERS = 300;

function normalizeAddress(value) {
  return String(value || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/^대구광역시/, "대구")
    .replace(/[\s,，.]/g, "")
    .trim();
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const values = [lat1, lng1, lat2, lng2].map(Number);
  if (!values.every(Number.isFinite)) return Infinity;
  const [a, b, c, d] = values.map(v => v * Math.PI / 180);
  const sinLat = Math.sin((c - a) / 2), sinLng = Math.sin((d - b) / 2);
  const h = sinLat ** 2 + Math.cos(a) * Math.cos(c) * sinLng ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function matchesOfficial(center, override) {
  const sameAddress = ADDRESS_FIELDS.every(key =>
    normalizeAddress(center[key]) === normalizeAddress(override[key]));
  const sameContact = CONTACT_FIELDS.every(key =>
    String(center[key] || "").replace(/\D/g, "") === String(override[key] || "").replace(/\D/g, ""));
  // Do not return to the official map coordinates until they are near the new location.
  const locationUpdated = distanceMeters(
    center.latitude, center.longitude,
    override.latitude, override.longitude) <= MAX_COORDINATE_DRIFT_METERS;
  return sameAddress && sameContact && locationUpdated;
}

function applyCenterOverrides(centers, registry) {
  const overrides = registry && registry.overrides || {};
  const remaining = { ...overrides };
  const releasedIds = [];
  const appliedIds = [];
  const seenIds = new Set();
  const updatedCenters = centers.map(center => {
    const entry = overrides[center.id];
    if (!entry) return center;
    seenIds.add(center.id);
    if (entry.name !== center.name) {
      throw new Error("Manual correction center identity mismatch: " + center.id);
    }
    if (matchesOfficial(center, entry)) {
      delete remaining[center.id];
      releasedIds.push(center.id);
      return center;
    }
    const updates = Object.fromEntries(OVERRIDE_FIELDS
      .filter(field => Object.prototype.hasOwnProperty.call(entry, field))
      .map(field => [field, entry[field]]));
    const patched = { ...center, ...updates };
    patched.address = [patched.address1, patched.address2].filter(Boolean).join(" ");
    appliedIds.push(center.id);
    return patched;
  });
  const missingIds = Object.keys(overrides).filter(id => !seenIds.has(id));
  if (missingIds.length) throw new Error("Manual correction target missing from headquarters feed: " + missingIds.join(", "));
  return {
    centers: updatedCenters,
    releasedIds,
    appliedIds,
    nextRegistry: { ...registry, overrides: remaining }
  };
}

module.exports = { applyCenterOverrides, matchesOfficial, distanceMeters };
