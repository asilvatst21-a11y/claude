import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function teamLogo(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return `/api/proxy/image?url=${encodeURIComponent(url)}`;
}

// Google/GitHub avatar CDNs don't send CORS headers, which taints the canvas and breaks
// html-to-image captures (e.g. league ranking "share as image"). Proxying through our own
// domain makes the response same-origin.
export function avatarSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return `/api/proxy/avatar?url=${encodeURIComponent(url)}`;
}
