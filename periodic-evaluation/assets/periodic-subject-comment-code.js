export const SUBJECT_CODES = Object.freeze({
  "Tiếng Việt": "TV",
  "Toán": "T",
  "Hoạt động trải nghiệm": "HDTN",
  "Đạo đức": "DD",
  "Tự nhiên và Xã hội": "TNXH",
  "Khoa học": "KH",
  "Lịch sử và Địa lý": "LSDL",
  "Tiếng Anh": "NN",
  "Giáo dục thể chất": "GDTC",
  "Tin học": "TH",
  "Công nghệ": "CN",
  "Nghệ thuật (Âm nhạc)": "AN",
  "Nghệ thuật (Mỹ thuật)": "MT"
});

export const PERIOD_CODES = Object.freeze({
  "Giữa kỳ 1": "GK1",
  "Cuối kỳ 1": "CK1",
  "Giữa kỳ 2": "GK2",
  "Cuối kỳ 2": "CK2"
});

export const PERIODIC_LEVEL_LABELS = Object.freeze({
  T: "Tốt",
  H: "Hoàn thành",
  C: "Chưa đạt"
});

export function evaluationLevelToCode(level) {
  return Object.keys(PERIODIC_LEVEL_LABELS).find(code =>
    level === code || level === PERIODIC_LEVEL_LABELS[code]
  ) ?? "";
}

export function periodicPeriodCode(period) {
  // The existing period selector spells “kì” with an i.
  const periodName = typeof period === "string" ? period.replace("kì", "kỳ") : "";
  return Object.hasOwn(PERIOD_CODES, periodName) ? PERIOD_CODES[periodName] : "";
}

export function normalizeClassCode(className) {
  if (typeof className !== "string") return "";
  const code = className.normalize("NFC").trim().replace(/^lớp\s*/iu, "").replace(/\s+/gu, "");
  return /^\p{N}[\p{L}\p{M}\p{N}._-]*$/u.test(code) && !/undefined|null/i.test(code)
    ? code.toUpperCase()
    : "";
}

export function generatePeriodicSubjectCommentCode({ subjectId, period, evaluationLevel, className, studentOrder }) {
  const subjectCode = Object.hasOwn(SUBJECT_CODES, subjectId) ? SUBJECT_CODES[subjectId] : "";
  const periodCode = periodicPeriodCode(period);
  const levelCode = evaluationLevelToCode(evaluationLevel);
  const classCode = normalizeClassCode(className);

  if (!subjectCode || !periodCode || !levelCode || !classCode ||
      !Number.isSafeInteger(studentOrder) || studentOrder <= 0) {
    return "";
  }
  const code = subjectCode + periodCode + levelCode + classCode + studentOrder;
  return /undefined|null|\s/i.test(code) ? "" : code;
}
