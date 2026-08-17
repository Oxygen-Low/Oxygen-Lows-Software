import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  getLanguageOption,
} from "@/lib/languages";
import { useLanguage } from "@/contexts/LanguageContext";
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
  value,
  onValueChange,
  disabled = false,
  className,
  triggerClassName,
  id = "language-select",
  ariaLabel = "Select language",
}: LanguageSelectProps) {
  const context = useLanguage();
  
  const activeValue = value !== undefined ? value : context.language;
  const handleChange = onValueChange !== undefined ? onValueChange : context.setLanguage;

  const currentOption = getLanguageOption(activeValue || DEFAULT_LANGUAGE);

  return (
    <div className={cn("w-full", className)}>
      <Select
        value={currentOption.name}
        onValueChange={handleChange}
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
                {lang.nativeName && lang.nativeName !== lang.name && (
                  <span className="text-xs text-slate-400 font-normal ml-1">
                    ({lang.nativeName})
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default LanguageSelect;
