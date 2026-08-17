import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  getLanguageOption,
} from "@/lib/languages";
import { cn } from "@/lib/utils";

export interface LanguageSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
}

export function LanguageSelect({
  value = DEFAULT_LANGUAGE,
  onValueChange,
  disabled = false,
  className,
  triggerClassName,
  id = "language-select",
  ariaLabel = "Select language",
}: LanguageSelectProps) {
  const currentOption = getLanguageOption(value);

  return (
    <div className={cn("w-full", className)}>
      <Select
        value={currentOption.name}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={ariaLabel}
          className={cn(
            "w-full bg-slate-950 border-slate-800 text-white focus:ring-cyan-500 hover:border-slate-700 transition flex items-center justify-between",
            triggerClassName,
          )}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="text-lg leading-none"
              role="img"
              aria-label={`${currentOption.name} flag`}
            >
              {currentOption.flag}
            </span>
            <span className="font-medium text-slate-200">
              {currentOption.name}
            </span>
          </div>
        </SelectTrigger>
        <SelectContent className="bg-slate-900 border-slate-800 text-white">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem
              key={lang.code}
              value={lang.name}
              className="flex items-center gap-2.5 focus:bg-slate-800 focus:text-white cursor-pointer py-2"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="text-lg leading-none"
                  role="img"
                  aria-label={`${lang.name} flag`}
                >
                  {lang.flag}
                </span>
                <span className="font-medium">{lang.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default LanguageSelect;
