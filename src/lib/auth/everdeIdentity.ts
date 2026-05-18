export function allowedEmailDomain(): string {
  return (process.env.EVERDE_ALLOWED_EMAIL_DOMAIN || "everde.com")
    .replace(/^@/, "")
    .toLowerCase();
}

export function emailFromEntraPayload(
  payload: Record<string, unknown>,
): string {
  return String(
    payload.preferred_username ??
      payload.upn ??
      payload.email ??
      payload.unique_name ??
      "",
  ).toLowerCase();
}

export function isAllowedEverdeEmail(email: string): boolean {
  const domain = allowedEmailDomain();
  return email.length > 0 && email.endsWith(`@${domain}`);
}
