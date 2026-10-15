"use client";

import { useState, type FormEvent } from "react";
import { sendJson } from "@/lib/api-client";
import { collect, validate, type Errors, type Rule } from "@/lib/validation";

type Options = {
  schema: Record<string, Rule>;
  url: string;
  method?: string;
  onSuccess?: (data: Record<string, unknown>, values: Record<string, string>) => void;
};

/** Validates in the browser, posts JSON to an API route, and keeps field errors in state. */
export function useApiForm({ schema, url, method = "POST", onSuccess }: Options) {
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setMessage(null);
    setCode(null);
    const current = collect(Object.fromEntries(new FormData(event.currentTarget)), Object.keys(schema));
    setValues(current);

    const found = validate(current, schema);
    setErrors(found ?? {});
    if (found) return;

    setBusy(true);
    const result = await sendJson(url, current, method);
    setBusy(false);

    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.message);
      setCode(result.code ?? null);
      return;
    }
    onSuccess?.(result.data, current);
  }

  return { errors, message, code, values, busy, submit };
}
