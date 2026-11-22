import type { Item } from "@fakkarni/shared";
import { language } from "@/i18n";

/**
 * Zaki's replies in the browser preview: a handful of rules, not the real AI. They show the
 * flow (a reminder gets saved, a debt gets noted, a tracker gets a log) with Zaki's voice.
 */
const ar = language === "ar-EG";
const L = (a: string, e: string) => (ar ? a : e);

export interface DemoReply {
  texts: string[];
  items: (Partial<Item> & Pick<Item, "title">)[];
  logWater?: boolean;
}

const at = (daysAhead: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

let generic = 0;

export function zakiReply(text: string, ctx: { name: string | null; upcoming: Item[]; water?: { week: number[]; goal: number | null } }): DemoReply {
  const t = text.trim().toLowerCase();
  const name = ctx.name ? (ar ? ` يا ${ctx.name}` : `, ${ctx.name}`) : "";

  if (/انتحر|اموت نفسي|أموت نفسي|kill myself|suicide/.test(t)) {
    return {
      texts: [L("أنا معاك ومهتم بيك جداً 💛 لو حاسس إنك ممكن تأذي نفسك، كلّم دلوقتي الخط الساخن ١٦٣٢٨ (مجاني) أو حد قريب منك.", "I'm here and I care about you 💛 If you might hurt yourself, please call 16328 (free, Egypt) or someone close to you right now.")],
      items: [],
    };
  }
  if (/شربت|مية|ميه|water|drank/.test(t) && !/فكر|remind/.test(t)) {
    const today = (ctx.water?.week[6] ?? 0) + 1;
    const goal = ctx.water?.goal ?? 8;
    return { texts: [L(`برافو${name} 💧 كده ${today} من ${goal} كوبايات النهارده.`, `Nice${name} 💧 That's ${today} of ${goal} glasses today.`)], items: [], logWater: true };
  }
  if (/فكر|فكّر|remind/.test(t)) {
    const tomorrow = /بكر|tomorrow/.test(t);
    const title = text.replace(/(فكّ?رني|فكرنى)\s*(ب|إن|ان)?\s*|remind me( to)?\s*/gi, "").replace(/\s*(بكرة|بكره|tomorrow)\s*/gi, " ").trim().slice(0, 60) || L("الحاجة دي", "this");
    const when = tomorrow ? at(1, 10) : at(0, Math.min(new Date().getHours() + 2, 22));
    return {
      texts: [L(`تمام${name}، هفكرك ${tomorrow ? "بكرة الصبح" : "كمان شوية"} 👌`, `Done${name}, I'll remind you ${tomorrow ? "tomorrow morning" : "in a bit"} 👌`)],
      items: [{ title, due_at: when, remind_at: when }],
    };
  }
  const amount = /(\d+)/.exec(t)?.[1];
  if (amount && /سلف|عليا|عليه|ليا عند|owe|lent|borrowed/.test(t)) {
    const theyOwe = /ليا عند|سلفت|lent|owes me/.test(t);
    return {
      texts: [L(`سجّلتها${name} 📒 لو عايز الطرف التاني يشوفها ويأكّد، ابعتها من الدفتر.`, `Noted${name} 📒 Send it from the Daftar if you want the other person to confirm.`)],
      items: [{ title: `${amount}`, type: "debt", debt_amount: Number(amount), debt_person: L("صاحبك", "your friend"), debt_direction: theyOwe ? "owed_to_me" : "i_owe" }],
    };
  }
  if (/عندي ايه|عندي إيه|الأسبوع|plans|this week|what do i have/.test(t)) {
    const lines = ctx.upcoming.slice(0, 4).map((i) => `• ${i.title}`);
    return { texts: [lines.length ? `${L("ده اللي عندك:", "Here's what you have:")}\n${lines.join("\n")}` : L("مفيش حاجة جاية، استمتع بوقتك 😌", "Nothing coming up. Enjoy your time 😌")], items: [] };
  }
  if (/تعبان|زهقان|متضايق|حزين|مخنوق|sad|tired|stressed|anxious|down/.test(t)) {
    return {
      texts: [
        L(`ألف سلامة عليك${name} 💛 الأيام دي بتعدّي. تحب تحكيلي حصل إيه؟`, `I'm sorry it's a hard day${name} 💛 Want to tell me what happened?`),
        L("وأنا هنا، خد راحتك واحكي براحتك 💛", "I'm right here. Take your time 💛"),
      ],
      items: [],
    };
  }
  if (/^(hi|hey|hello|اهلا|أهلا|ازيك|إزيك|السلام|صباح|مساء)/.test(t)) {
    return { texts: [L(`أهلاً بيك${name} 😊 أنا هنا. يومك ماشي إزاي؟`, `Hey${name} 😊 I'm here. How's your day going?`)], items: [] };
  }
  const pool = ar
    ? ["حلو أوي إنك قولتلي 😊 تحب أفتكرلك حاجة منها؟", "فاهمك. وأنا موجود لو احتجت أي حاجة 💛", "عاش! كمّل كده 💪"]
    : ["Thanks for telling me 😊 Want me to remember anything from that?", "I get you. I'm here whenever you need me 💛", "Love that! Keep going 💪"];
  const reply = pool[generic++ % pool.length]!;
  return {
    texts: generic === 1 ? [reply, L("(دي نسخة تجربة: ردود زكي هنا بسيطة، والحقيقي أذكى بكتير ✨)", "(This is a preview: Zaki's replies here are simple; the real one is much smarter ✨)")] : [reply],
    items: [],
  };
}
