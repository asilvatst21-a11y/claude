import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts an Excel serial date number to a JavaScript Date object.
 * Excel dates start from January 1, 1900 (serial 1).
 * There's a known Excel bug where 1900 is treated as a leap year, so we offset by 2.
 */
export function excelDateToJSDate(serial: number): Date {
  // Excel serial date: days since Jan 1, 1900 (with the 1900 leap year bug)
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  return new Date(utcValue);
}

/**
 * Formats a date to ISO date string (YYYY-MM-DD).
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Formats a phone number for Z-API (Brazilian numbers).
 * Strips non-numeric characters and ensures country code 55.
 * Returns the formatted number or null if invalid.
 */
export function formatPhoneForZAPI(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Remove all non-numeric characters
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 0) return null;

  // If starts with 55 and has 12-13 digits (55 + DDD + number)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // If it's a Brazilian number without country code (10-11 digits)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // Already has country code but doesn't start with 55
  if (digits.length >= 12) {
    return digits;
  }

  return null;
}

/**
 * Formats a currency value in BRL.
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Formats a date in Brazilian format (DD/MM/YYYY).
 */
export function formatDateBR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = typeof dateStr === "string" ? new Date(dateStr + "T00:00:00") : dateStr;
    return date.toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
}
