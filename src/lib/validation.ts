export type Errors = Record<string, string>;
export type Rule = (value: string, all: Record<string, string>) => string | null;

const SECRETS = new Set(["password", "confirmPassword"]);

/** Pull the named fields out of raw input and clean them. Runs on client and server. */
export function collect(raw: Record<string, unknown>, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    let value = typeof raw[key] === "string" ? (raw[key] as string) : "";
    if (!SECRETS.has(key)) value = value.trim();
    if (key === "email") value = value.toLowerCase();
    if (key === "phone") value = value.replace(/[\s\-()]/g, "");
    out[key] = value;
  }
  return out;
}

export function validate<K extends string>(values: Record<string, string>, schema: Record<K, Rule>): Errors | null {
  const errors: Errors = {};
  for (const [field, rule] of Object.entries<Rule>(schema)) {
    const message = rule(values[field] ?? "", values);
    if (message) errors[field] = message;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

const filled: Rule = (v) => (v ? null : "This field is required.");

const email: Rule = (v) => {
  if (!v) return "Enter your email address.";
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address.";
  return null;
};

const password: Rule = (v) => {
  if (v.length < 6) return "Use at least 6 characters.";
  if (v.length > 72) return "Use 72 characters or fewer.";
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return "Include at least one letter and one number.";
  return null;
};

const confirmPassword: Rule = (v, all) => (v === all.password ? null : "Passwords do not match.");

const personName: Rule = (v) => {
  if (v.length < 2) return "Enter at least 2 characters.";
  if (v.length > 80) return "Use 80 characters or fewer.";
  if (!/^\p{L}[\p{L}\s'.-]*$/u.test(v)) return "Use letters, spaces, hyphens and apostrophes only.";
  return null;
};

const phone: Rule = (v) =>
  /^\+[1-9]\d{7,14}$/.test(v) ? null : "Enter the number with country code, like +2348012345678.";

const code: Rule = (v) => (/^\d{6}$/.test(v) ? null : "Enter the 6 digit code.");
const referralCode: Rule = (v) => (!v || /^[A-Z0-9]{6,16}$/i.test(v) ? null : "Enter a valid referral code.");

const bankName: Rule = (v) => (v.length >= 2 && v.length <= 60 ? null : "Enter the bank name.");
const accountNumber: Rule = (v) => (/^\d{6,20}$/.test(v) ? null : "Account number must be 6 to 20 digits.");
const dateOfBirth: Rule = (v) => {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Enter your date of birth.";
  const year = Number(v.slice(0, 4));
  const month = Number(v.slice(5, 7));
  const day = Number(v.slice(8, 10));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  const today = new Date();
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || v <= "1900-01-01" || v > todayText) {
    return "Enter a valid date of birth.";
  }
  return null;
};

/** Bank details are optional, but if one field is filled all three are needed. */
const bankGroup =
  (rule: Rule): Rule =>
  (v, all) =>
    [all.bankName, all.accountNumber, all.accountName].some(Boolean) ? rule(v, all) : null;

export const schemas = {
  register: { fullName: personName, email, password, confirmPassword, referralCode },
  login: { email, password: filled },
  forgotPassword: { email },
  resetPassword: { password, confirmPassword },
  resendEmail: { email },
  phoneSend: { phone },
  phoneVerify: { phone, code },
  profile: {
    fullName: personName,
    dateOfBirth,
    bankName: bankGroup(bankName),
    accountNumber: bankGroup(accountNumber),
    accountName: bankGroup(personName),
  },
} satisfies Record<string, Record<string, Rule>>;
