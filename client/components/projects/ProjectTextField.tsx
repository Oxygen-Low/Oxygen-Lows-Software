import { useEffect, useRef, useState } from "react";

interface ProjectTextFieldProps {
  value: string;
  onSave: (value: string) => Promise<unknown>;
  multiline?: boolean;
  rows?: number;
  className?: string;
  placeholder?: string;
}

/** Keep typing independent of network latency; failed saves retain the draft. */
export function ProjectTextField({ value, onSave, multiline, ...props }: ProjectTextFieldProps) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const currentDraft = useRef(value);
  useEffect(() => {
    if (!dirty.current) {
      setDraft(value);
      currentDraft.current = value;
    }
  }, [value]);

  const onBlur = async () => {
    if (!dirty.current) return;
    const submitted = currentDraft.current;
    const saved = await onSave(submitted);
    if (saved && currentDraft.current === submitted) dirty.current = false;
  };
  const onChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    dirty.current = true;
    currentDraft.current = event.target.value;
    setDraft(event.target.value);
  };
  return multiline
    ? <textarea {...props} value={draft} onChange={onChange} onBlur={onBlur} />
    : <input {...props} value={draft} onChange={onChange} onBlur={onBlur} />;
}
