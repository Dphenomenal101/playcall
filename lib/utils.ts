import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// callType/outcome are stored lowercase ("discovery", "next step booked")
// since they're free-text DB columns, not display strings - capitalize just
// the first letter for rendering rather than storing display casing.
export function capitalizeFirst(value: string) {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}
