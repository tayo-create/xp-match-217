import type { Place } from "@/lib/types";

/**
 * Partner ids for affiliate tracking. Leave empty until the partner programs approve the account;
 * links still work, they just don't earn commission.
 */
const AFFILIATE = { bookingAid: "", viatorPid: "" } as const;

export interface BookingLink {
  label: string;
  partner: string;
  url: string;
}

/** Where to book or reserve a place: hotels on Booking.com, experiences on Viator, tables via Google Maps. */
export const bookingLinkFor = (place: Pick<Place, "name" | "city" | "kind">): BookingLink => {
  const q = encodeURIComponent(`${place.name} ${place.city}`.trim());
  if (place.kind === "stay") {
    return { label: "Book a room", partner: "Booking.com", url: `https://www.booking.com/searchresults.html?ss=${q}${AFFILIATE.bookingAid ? `&aid=${AFFILIATE.bookingAid}` : ""}` };
  }
  if (place.kind === "do") {
    return { label: "Book tickets", partner: "Viator", url: `https://www.viator.com/searchResults/all?text=${q}${AFFILIATE.viatorPid ? `&pid=${AFFILIATE.viatorPid}` : ""}` };
  }
  return { label: place.kind === "move" ? "Directions" : "Reserve", partner: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${q}` };
};
