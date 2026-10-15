import type { InputHTMLAttributes, ReactNode } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
};

export function Field({ label, error, hint, id, name, className = "", ...props }: FieldProps) {
  const inputId = id ?? name;
  const noteId = `${inputId}-note`;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium">{label}</label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        className={`input mt-1 read-only:bg-line/30 ${error ? "border-red-500" : ""} ${className}`}
        {...props}
      />
      {error ? (
        <p id={noteId} className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p id={noteId} className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  const style = tone === "error"
    ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
    : "border-line bg-line/30 text-ink";
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${style}`}>
      {children}
    </p>
  );
}
