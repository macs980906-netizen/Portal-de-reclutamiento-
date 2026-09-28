"use client";

import { useId } from "react";

type Base = {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
};

function Label({ htmlFor, label, optional }: { htmlFor?: string; label: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="field-label">
      {label}
      {optional && <span className="ml-2 text-sm font-normal text-mute">(opcional)</span>}
    </label>
  );
}

function ErrorText({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="field-error mt-2">
      <span aria-hidden="true">⚠ </span>
      {error}
    </p>
  );
}

export function TextField({
  label,
  hint,
  error,
  optional,
  value,
  onChange,
  name,
  type = "text",
  autoComplete,
  inputMode,
  placeholder,
  maxLength,
}: Base & {
  value: string;
  onChange: (v: string) => void;
  name: string;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  maxLength?: number;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  return (
    <div>
      <Label htmlFor={id} label={label} optional={optional} />
      {hint && (
        <p id={hintId} className="field-hint mt-1">
          {hint}
        </p>
      )}
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined}
        aria-required={optional ? undefined : true}
        data-field={name}
        className="input mt-2"
      />
      <ErrorText id={errId} error={error} />
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  optional,
  value,
  onChange,
  name,
  maxLength,
  rows = 4,
}: Base & { value: string; onChange: (v: string) => void; name: string; maxLength: number; rows?: number }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const countId = `${id}-count`;
  return (
    <div>
      <Label htmlFor={id} label={label} optional={optional} />
      {hint && (
        <p id={hintId} className="field-hint mt-1">
          {hint}
        </p>
      )}
      <textarea
        id={id}
        name={name}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : "", error ? errId : "", countId].filter(Boolean).join(" ")}
        aria-required={optional ? undefined : true}
        data-field={name}
        className="input mt-2"
      />
      <div className="flex justify-between gap-4">
        <ErrorText id={errId} error={error} />
        <p id={countId} className="field-hint ml-auto mt-2 tabular-nums" aria-live="off">
          {value.length}/{maxLength}
        </p>
      </div>
    </div>
  );
}

type Opt = { readonly id: string; readonly label: React.ReactNode; readonly description?: React.ReactNode };

export function RadioCards({
  legend,
  hint,
  error,
  optional,
  options,
  value,
  onChange,
  name,
  columns = 1,
  legendClassName,
}: Base & {
  legend?: React.ReactNode;
  options: readonly Opt[];
  value: string;
  onChange: (v: string) => void;
  name: string;
  columns?: 1 | 2;
  legendClassName?: string;
  label?: React.ReactNode;
}) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  return (
    <fieldset
      aria-describedby={[hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined}
      aria-required={optional ? undefined : true}
      data-field={name}
    >
      <legend className={legendClassName ?? "field-label"}>
        {legend}
        {optional && <span className="ml-2 text-sm font-normal text-mute">(opcional)</span>}
      </legend>
      {hint && (
        <p id={hintId} className="field-hint mt-1">
          {hint}
        </p>
      )}
      <div className={`mt-3 grid gap-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {options.map((o) => (
          <label key={o.id} className="choice">
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
            />
            <span>
              <span className="block font-medium leading-snug">{o.label}</span>
              {o.description && <span className="mt-1 block text-sm text-mute">{o.description}</span>}
            </span>
          </label>
        ))}
      </div>
      <ErrorText id={errId} error={error} />
    </fieldset>
  );
}

export function CheckboxCards({
  legend,
  hint,
  error,
  optional,
  options,
  values,
  onChange,
  name,
  columns = 1,
}: Base & {
  legend: React.ReactNode;
  options: readonly Opt[];
  values: string[];
  onChange: (v: string[]) => void;
  name: string;
  columns?: 1 | 2;
  label?: React.ReactNode;
}) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  return (
    <fieldset aria-describedby={[hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined} data-field={name}>
      <legend className="field-label">
        {legend}
        {optional && <span className="ml-2 text-sm font-normal text-mute">(opcional)</span>}
      </legend>
      {hint && (
        <p id={hintId} className="field-hint mt-1">
          {hint}
        </p>
      )}
      <div className={`mt-3 grid gap-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {options.map((o) => (
          <label key={o.id} className="choice">
            <input
              type="checkbox"
              name={name}
              value={o.id}
              checked={values.includes(o.id)}
              onChange={(e) => onChange(e.target.checked ? [...values, o.id] : values.filter((v) => v !== o.id))}
              aria-invalid={error ? true : undefined}
            />
            <span className="font-medium leading-snug">{o.label}</span>
          </label>
        ))}
      </div>
      <ErrorText id={errId} error={error} />
    </fieldset>
  );
}

export function Checkbox({
  label,
  hint,
  error,
  checked,
  onChange,
  name,
}: Base & { checked: boolean; onChange: (v: boolean) => void; name: string }) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="choice">
        <input
          id={id}
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined}
          data-field={name}
        />
        <span>
          <span className="block font-medium leading-snug">{label}</span>
          {hint && (
            <span id={hintId} className="mt-1 block text-sm text-mute">
              {hint}
            </span>
          )}
        </span>
      </label>
      <ErrorText id={errId} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  value,
  onChange,
  name,
  options,
  placeholder = "Selecciona una opción",
}: Base & {
  value: string;
  onChange: (v: string) => void;
  name: string;
  options: readonly { id: string; label: string }[];
  placeholder?: string;
}) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  return (
    <div>
      <Label htmlFor={id} label={label} optional={optional} />
      {hint && (
        <p id={hintId} className="field-hint mt-1">
          {hint}
        </p>
      )}
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined}
        data-field={name}
        className="input mt-2"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ErrorText id={errId} error={error} />
    </div>
  );
}
