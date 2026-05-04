// Guess Zoopla /to-rent/property/{slug}/ from a Rightmove-style address (town before county/postcode).
import type { ListingRentProfile } from "./types";

const COUNTIES = new Set(
  [
    "Avon",
    "Bedfordshire",
    "Berkshire",
    "Bristol",
    "Buckinghamshire",
    "Cambridgeshire",
    "Cheshire",
    "Cornwall",
    "Cumbria",
    "Derbyshire",
    "Devon",
    "Dorset",
    "Durham",
    "East Sussex",
    "East Yorkshire",
    "Essex",
    "Gloucestershire",
    "Greater London",
    "Greater Manchester",
    "Hampshire",
    "Herefordshire",
    "Hertfordshire",
    "Isle of Wight",
    "Kent",
    "Lancashire",
    "Leicestershire",
    "Lincolnshire",
    "London",
    "Merseyside",
    "Norfolk",
    "North Yorkshire",
    "Northamptonshire",
    "Northumberland",
    "Nottinghamshire",
    "Oxfordshire",
    "Rutland",
    "Shropshire",
    "Somerset",
    "South Yorkshire",
    "Staffordshire",
    "Suffolk",
    "Surrey",
    "Tyne and Wear",
    "Warwickshire",
    "West Midlands",
    "West Sussex",
    "West Yorkshire",
    "Wiltshire",
    "Worcestershire",
    "Anglesey",
    "Cardiff",
    "Carmarthenshire",
    "Ceredigion",
    "Conwy",
    "Denbighshire",
    "Flintshire",
    "Gwynedd",
    "Monmouthshire",
    "Neath Port Talbot",
    "Newport",
    "Pembrokeshire",
    "Powys",
    "Swansea",
    "Torfaen",
    "Vale of Glamorgan",
    "Wrexham",
    "Scotland",
    "Wales",
    "England",
    "Northern Ireland",
    "UK",
  ].map((s) => s.toLowerCase()),
);

function looksLikeUkPostcodeToken(token: string): boolean {
  const compact = token.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z]{1,2}\d[A-Z0-9]?\d[A-Z]{2}$/.test(compact)) {
    return true;
  }
  if (/^[A-Z]{1,2}\d[A-Z0-9]?$/i.test(compact) && compact.length <= 4) {
    return true;
  }
  return false;
}

function looksLikeStreetLine(token: string): boolean {
  return /\b(road|street|st\.|lane|way|drive|drives|close|rise|avenue|ave|boulevard|crescent|cr|place|court|gardens|walk|terrace|mews|hill|row|wharf|apartments|lodge|house|flats|flat|building)\b/i.test(
    token,
  );
}

function slugifyTown(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Best-effort town slug for Zoopla URLs, from listing address/headline.
 * Returns null if no plausible town token is found.
 */
export function inferZooplaTownSlug(listing: ListingRentProfile): string | null {
  const corpus = [listing.address, listing.headline].filter(Boolean).join(", ");
  const parts = corpus
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const raw = parts[i];
    if (!raw || raw.length < 4 || raw.length > 48) {
      continue;
    }
    if (looksLikeUkPostcodeToken(raw)) {
      continue;
    }
    if (COUNTIES.has(raw.toLowerCase())) {
      continue;
    }
    if (looksLikeStreetLine(raw)) {
      continue;
    }
    if (!/^[A-Za-z]/.test(raw)) {
      continue;
    }
    const slug = slugifyTown(raw);
    if (slug.length >= 3) {
      return slug;
    }
  }

  return null;
}
