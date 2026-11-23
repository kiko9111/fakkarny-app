/** Strings carry emoji for the chat; screens draw a real icon instead, so strip them there. */
export const plain = (s: string) => s.replace(/[\p{Extended_Pictographic}️‍]+/gu, "").replace(/\s{2,}/g, " ").trim();
