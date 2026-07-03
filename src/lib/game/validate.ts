/**
 * Manual input validators (no zod).
 *
 * Each validator returns `null` on success or a Russian error string on
 * failure. The LIMITS constant collects every length cap in one place so we
 * can audit them at a glance.
 *
 * These are the ONLY validators used by API routes. They are intentionally
 * strict (reject control chars, reject leading/trailing whitespace, enforce
 * character set + length) so a malicious client can't smuggle HTML, SQL, or
 * JS into a stored field.
 */

export const LIMITS = {
  /** Player display name (Russian-friendly letters + digits + . - _ ' space). */
  PLAYER_NAME_MIN: 1,
  PLAYER_NAME_MAX: 20,
  /** Username for auth (if we add auth later). */
  USERNAME_MIN: 3,
  USERNAME_MAX: 24,
  /** Password for auth. */
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  /** Room code — 6-char uppercase alphanumeric. */
  ROOM_CODE_LENGTH: 6,
  /** Free-form player action text. */
  ACTION_TEXT_MAX: 500,
  /** NPC dialogue line. */
  DIALOGUE_TEXT_MAX: 300,
  /** Generic short string (item name, etc.). */
  SHORT_STRING_MAX: 80,
  /** Generic long string (description). */
  LONG_STRING_MAX: 1000,
} as const;

/** Strip control chars (except \n for multiline fields) and trim. */
export function sanitizeString(s: string, opts: { allowNewlines?: boolean } = {}): string {
  if (typeof s !== "string") return "";
  const ctrlRe = opts.allowNewlines ? /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g : /[\x00-\x1F\x7F]/g;
  return s.replace(ctrlRe, "").trim();
}

/**
 * Player name: 1..20 chars, allowed set = letters (incl. Cyrillic), digits,
 * spaces, dot, dash, underscore, apostrophe. No leading/trailing whitespace
 * (already trimmed by sanitizeString).
 */
export function validatePlayerName(name: string): string | null {
  const cleaned = sanitizeString(name);
  if (cleaned.length === 0) return "Введите имя героя.";
  if (cleaned.length > LIMITS.PLAYER_NAME_MAX) {
    return `Имя героя не длиннее ${LIMITS.PLAYER_NAME_MAX} символов.`;
  }
  // Letters (Latin + Cyrillic), digits, space, dot, dash, underscore, apostrophe.
  if (!/^[\p{L}\p{N} .'_-]+$/u.test(cleaned)) {
    return "Имя героя содержит недопустимые символы.";
  }
  return null;
}

/** Username: 3..24 chars, ASCII letters/digits/dot/dash/underscore only. */
export function validateUsername(username: string): string | null {
  const cleaned = sanitizeString(username);
  if (cleaned.length < LIMITS.USERNAME_MIN) {
    return `Имя пользователя не короче ${LIMITS.USERNAME_MIN} символов.`;
  }
  if (cleaned.length > LIMITS.USERNAME_MAX) {
    return `Имя пользователя не длиннее ${LIMITS.USERNAME_MAX} символов.`;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(cleaned)) {
    return "Имя пользователя содержит недопустимые символы (только латиница, цифры, точка, дефис, подчёркивание).";
  }
  return null;
}

/**
 * Password: 8..128 chars. Must contain at least one letter and one digit OR
 * one letter and one symbol (basic complexity).
 */
export function validatePassword(password: string): string | null {
  if (typeof password !== "string" || password.length === 0) return "Введите пароль.";
  if (password.length < LIMITS.PASSWORD_MIN) {
    return `Пароль не короче ${LIMITS.PASSWORD_MIN} символов.`;
  }
  if (password.length > LIMITS.PASSWORD_MAX) {
    return `Пароль не длиннее ${LIMITS.PASSWORD_MAX} символов.`;
  }
  // Reject control chars / whitespace inside the password.
  if (/[\x00-\x1F\x7F\s]/.test(password)) {
    return "Пароль не должен содержать пробелов или управляющих символов.";
  }
  const hasLetter = /[A-Za-zА-Яа-яЁё]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-zА-Яа-яЁё0-9]/.test(password);
  if (!hasLetter || (!hasDigit && !hasSymbol)) {
    return "Пароль должен содержать буквы и хотя бы одну цифру или символ.";
  }
  return null;
}

/** Room code: exactly 6 uppercase ASCII letters/digits. */
export function validateRoomCode(code: string): string | null {
  if (typeof code !== "string" || code.length === 0) return "Укажите код комнаты.";
  const upper = code.toUpperCase().trim();
  if (upper.length !== LIMITS.ROOM_CODE_LENGTH) {
    return `Код комнаты состоит из ${LIMITS.ROOM_CODE_LENGTH} символов.`;
  }
  if (!/^[A-Z0-9]{6}$/.test(upper)) {
    return "Код комнаты содержит только заглавные латинские буквы и цифры.";
  }
  return null;
}

/** Player action text: 1..500 chars (after sanitization). */
export function validateActionText(text: string): string | null {
  if (typeof text !== "string" || text.trim().length === 0) {
    return "Опишите действие героя.";
  }
  const cleaned = sanitizeString(text, { allowNewlines: true });
  if (cleaned.length === 0) return "Опишите действие героя.";
  if (cleaned.length > LIMITS.ACTION_TEXT_MAX) {
    return `Действие не длиннее ${LIMITS.ACTION_TEXT_MAX} символов.`;
  }
  return null;
}

/** Dialogue line: 1..300 chars. */
export function validateDialogueText(text: string): string | null {
  if (typeof text !== "string" || text.trim().length === 0) {
    return "Введите реплику.";
  }
  const cleaned = sanitizeString(text, { allowNewlines: true });
  if (cleaned.length === 0) return "Введите реплику.";
  if (cleaned.length > LIMITS.DIALOGUE_TEXT_MAX) {
    return `Реплика не длиннее ${LIMITS.DIALOGUE_TEXT_MAX} символов.`;
  }
  return null;
}

/** Generic short-string validator (item names, etc.). */
export function validateShortString(text: string, label = "Поле"): string | null {
  if (typeof text !== "string" || text.trim().length === 0) {
    return `${label} не должно быть пустым.`;
  }
  const cleaned = sanitizeString(text);
  if (cleaned.length === 0) return `${label} не должно быть пустым.`;
  if (cleaned.length > LIMITS.SHORT_STRING_MAX) {
    return `${label} не длиннее ${LIMITS.SHORT_STRING_MAX} символов.`;
  }
  return null;
}
