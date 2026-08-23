import React, { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CountryFlagProps {
  countryCode?: string | null;
  className?: string;
  alt?: string;
}

export function CountryFlag({
  countryCode,
  className = "w-4 h-3 rounded-[2px] object-cover shrink-0 inline-block shadow-sm",
  alt,
}: CountryFlagProps) {
  const [hasError, setHasError] = useState(false);

  if (!countryCode || countryCode.length !== 2) {
    return (
      <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0 inline-block" />
    );
  }

  const code = countryCode.toLowerCase();

  if (hasError) {
    return (
      <span className="inline-flex items-center justify-center bg-slate-800 text-[10px] font-semibold text-slate-300 px-1 py-0.5 rounded border border-slate-700 select-none shrink-0 leading-none">
        {countryCode.toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      alt={alt || `${countryCode.toUpperCase()} flag`}
      className={cn("inline-block", className)}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

export default CountryFlag;
