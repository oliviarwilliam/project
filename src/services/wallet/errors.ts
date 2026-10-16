const CATALOG = {
  UNAUTHORIZED: [401, "Sign in to continue."],
  FORBIDDEN: [403, "You do not have access to this."],
  NOT_AUTHORIZED: [403, "You do not have access to this."],
  VALIDATION_ERROR: [400, "The request is not valid."],
  INVALID_AMOUNT: [400, "Enter a valid amount with at most two decimals."],
  REASON_REQUIRED: [400, "Give a reason of at least five characters."],
  IDEMPOTENCY_KEY_REQUIRED: [400, "Send an Idempotency-Key header."],
  WALLET_NOT_FOUND: [404, "Wallet not found."],
  TRANSACTION_NOT_FOUND: [404, "Transaction not found."],
  PACKAGE_UNAVAILABLE: [404, "This package is not available."],
  PACKAGE_NOT_ACTIVE: [409, "This package is not active."],
  PAYOUT_NOT_DUE: [409, "No payout is due yet."],
  EARNING_EXISTS: [409, "This period was already paid."],
  PACKAGE_LIMIT_REACHED: [409, "You have reached the limit for this package."],
  INSUFFICIENT_FUNDS: [422, "Your balance is too low."],
  BELOW_MIN_WITHDRAWAL: [422, "This amount is below the minimum withdrawal amount."],
  PROFILE_INCOMPLETE: [422, "Add your date of birth before withdrawing."],
  REFERRALS_REQUIRED: [403, "You have not met the funded referral requirement for withdrawing referral rewards."],
  REFERRAL_REWARD_INSUFFICIENT: [422, "That is more than your available referral rewards."],
  ACCOUNT_RESTRICTED: [403, "Your account cannot make this transaction."],
  MAINTENANCE_MODE: [503, "Wallet actions are paused for maintenance."],
  UNSUPPORTED_CURRENCY: [400, "This currency cannot be funded."],
  AMOUNT_OUT_OF_RANGE: [400, "The amount is outside the allowed range."],
  TOO_MANY_ATTEMPTS: [429, "Too many attempts. Wait a few minutes and try again."],
  PAYMENT_NOT_FOUND: [404, "Payment not found."],
  PAYMENT_AMOUNT_MISMATCH: [422, "The paid amount did not match. Please contact support."],
  PAYMENT_GATEWAY_ERROR: [502, "The payment service is unavailable. Try again shortly."],
  PACKAGE_NOT_FOUND: [404, "Package not found."],
  PACKAGE_NAME_TAKEN: [409, "A package with this name already exists."],
  PACKAGE_IN_USE: [409, "Members are still using this package. Disable it instead."],
  INVALID_DURATION: [422, "Duration must be at least the payout interval."],
  DUPLICATE_PURCHASE: [409, "You just bought this package. Wait a moment before buying it again."],
  IDEMPOTENCY_KEY_REUSED: [409, "This request key was already used for something else."],
  WITHDRAWAL_COOLDOWN: [409, "Your next eligible withdrawal date is shown in your withdrawal details."],
  EXCEEDS_PROFIT_BALANCE: [422, "You can only withdraw profit. Enter an amount up to your available profit."],
  NO_PROFIT_AVAILABLE: [422, "You do not have enough profit to withdraw yet."],
  WITHDRAWAL_NOT_FOUND: [404, "Withdrawal not found."],
  WITHDRAWAL_NOT_PENDING: [409, "This withdrawal has already been reviewed."],
  WITHDRAWAL_NOT_APPROVED: [409, "Approve this withdrawal before marking it paid."],
  SETTING_NOT_EDITABLE: [400, "This setting cannot be changed here."],
  USER_NOT_FOUND: [404, "User not found."],
  USER_IS_ADMIN: [409, "Admin accounts cannot be deleted here."],
  CANNOT_MODIFY_SELF: [409, "You cannot change your own account here."],
  TRANSFER_NOT_FOUND: [404, "Transfer not found."],
  TRANSFER_IN_PROGRESS: [409, "A bank transfer for this withdrawal is in progress. Wait for it to finish."],
  TRANSFER_ATTEMPTS_EXHAUSTED: [409, "Automatic transfer attempts are used up. Send it again from the admin panel."],
  TRANSFERS_DISABLED: [409, "Automatic transfers are turned off. Pay this withdrawal manually."],
  RATE_LIMITED: [429, "Too many requests. Please wait a moment and try again."],
  UNSUPPORTED_MEDIA_TYPE: [415, "Send the request as JSON."],
  PAYLOAD_TOO_LARGE: [413, "That request is too large."],
  CSRF_BLOCKED: [403, "This request was blocked for your safety."],
  INTERNAL_ERROR: [500, "Something went wrong. Please try again."],
} as const;

export type WalletErrorCode = keyof typeof CATALOG;

export class WalletError extends Error {
  readonly status: number;

  constructor(readonly code: WalletErrorCode, message?: string) {
    super(message ?? CATALOG[code][1]);
    this.status = CATALOG[code][0];
  }
}

// Database functions raise plain codes such as INSUFFICIENT_FUNDS.
export function fromDbError(error: { message: string }): WalletError {
  const code = error.message.trim();
  if (code in CATALOG) return new WalletError(code as WalletErrorCode);
  console.error("[wallet] database error:", error);
  return new WalletError("INTERNAL_ERROR");
}
