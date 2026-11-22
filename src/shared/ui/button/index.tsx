import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export function Button({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-200 text-[#183027] transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40", className)} {...props} />;
}
