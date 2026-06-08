"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";

export function DashboardSortHead({
  field,
  label,
  prefix,
  className,
}: {
  field: string;
  label: string;
  prefix: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const sortKey = `${prefix}_sort`;
  const dirKey = `${prefix}_dir`;
  const currentField = searchParams.get(sortKey);
  const currentDir = searchParams.get(dirKey) ?? "asc";
  const active = currentField === field;

  const nextDir = active && currentDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams(searchParams.toString());
  params.set(sortKey, field);
  params.set(dirKey, nextDir);

  return (
    <TableHead className={className}>
      <Link
        href={`${pathname}?${params.toString()}`}
        className="flex items-center gap-1 font-medium hover:text-foreground transition-colors"
      >
        {label}
        {active ? (
          currentDir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </Link>
    </TableHead>
  );
}
