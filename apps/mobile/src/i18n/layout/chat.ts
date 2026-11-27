import type { SameKeys } from "./shape";

// Layout rebuild: the chat's "+" and what it starts (owner: the chat area). Reached as t.lay.chat.<key>. Same keys in both languages.
const ar = {
  /** The "+" beside the composer: its spoken label and the sheet's title. */
  plus: "ابدأ حاجة",
  remind: "فكّرني",
  list: "ضيف للقايمة",
  ask: "اطلب من حد",
  homework: "واجب من المدرسة",
  medicine: "مواعيد دوا",
  split: "قسّم حساب",
  receipt: "صوّر فاتورة",
  /** A message from WhatsApp: the "+" row, the paste screen, and the label on a forwarded bubble. */
  forward: "رسالة من واتساب",
  forwardTitle: "رسالة من واتساب",
  forwardHint: "الصق الرسالة هنا",
  forwardSend: "ابعتها لزكي",
  forwarded: "رسالة متحوّلة",
  forwardEmpty: "مفيش كلام في الرسالة",
  forwardOther: "زكي بيقرا الكلام وصور الفواتير بس",
  /** The second step, when more than one circle fits. */
  whichCircle: "أنهي دايرة؟",
  /** What "Remind me" writes in the composer; she finishes the sentence. Keep the space at the end. */
  remindStarter: "فكّرني ",
  /** Old quick replies that the "+" now starts: not shown as chips any more. */
  inPlus: ["فكّرني بحاجة"],
};

const en: SameKeys<typeof ar> = {
  plus: "Start something",
  remind: "Remind me",
  list: "Add to a list",
  ask: "Ask someone",
  homework: "Homework from school",
  medicine: "Medicine times",
  split: "Split a bill",
  receipt: "Scan a receipt",
  forward: "From WhatsApp",
  forwardTitle: "From WhatsApp",
  forwardHint: "Paste the message here",
  forwardSend: "Send to Zaki",
  forwarded: "Forwarded",
  forwardEmpty: "There are no words in it",
  forwardOther: "Zaki reads words and receipt photos only",
  whichCircle: "Which circle?",
  remindStarter: "Remind me to ",
  inPlus: ["Remind me of something"],
};

export const strings = { "ar-EG": ar, en } as const;
