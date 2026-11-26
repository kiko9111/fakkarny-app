import { splitThings, type ListPlace } from "@fakkarni/shared";

/**
 * Household list messages read by rules (no AI call, no allowance used), strict on purpose:
 * only messages that say "list" in so many words, ask what is on it, or say the user is going
 * shopping. "محتاجين عيش" without the word list goes to the model, which already writes such
 * things as list items (and those land on the household list too, pipeline step 4).
 */

export type ListIntent =
  | {
      kind: "add";
      things: { title: string; qty: string | null }[];
      hint: string | null;
    }
  | { kind: "show"; hint: string | null }
  | { kind: "trip"; hint: string | null }
  | { kind: "got"; things: string[] };

const LIST_WORD = String.raw`(?:ال)?(?:قايمة|قايمه|قائمة|قائمه|ليستة|ليسته|لستة|لسته|ليست|طلبات)`;
const LIST_WORD_EN = String.raw`(?:shopping\s+|grocery\s+|groceries\s+)?list`;
const FRANCO_LIST = String.raw`(?:el\s*)?(?:list[ae]?|2ayma|ayma|2a2ema|talabat)`;

/** What follows the list word: "قايمة الصيدلية" → "الصيدلية". */
const tailHint = (s: string | undefined): string | null => {
  const t = (s ?? "").replace(/[.!؟?]+$/u, "").trim();
  return t && t.split(/\s+/).length <= 3 ? t : null;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Words that mean the message is a plan, a question or a negation: never a list add. */
const NOT_ADD =
  /(?:^|\s)(?:مش|مايضيفش|متضيفش|لا\s|ليه|إزاي|ازاي|امتى|إمتى|don'?t|do not|why|how|when|remind|فكرني|فكّرني)(?:\s|$)/iu;

export function readListMessage(input: string): ListIntent | null {
  const text = clean(input);
  if (!text || text.length > 300) return null;

  // Show: "القايمة فيها ايه" / "إيه اللي في القايمة" / "what's on the list" / "eh el list".
  const show =
    text.match(
      new RegExp(
        String.raw`^(?:ايه|إيه|ايش)\s+(?:اللي\s+)?(?:في|ف|على)\s+${LIST_WORD}\s*(.*?)[؟?]*$`,
        "u",
      ),
    ) ??
    text.match(
      new RegExp(
        String.raw`^${LIST_WORD}\s*(.*?)\s+(?:فيها|عليها)\s+(?:ايه|إيه)[؟?]*$`,
        "u",
      ),
    ) ??
    text.match(
      new RegExp(
        String.raw`^(?:what'?s|what\s+is|show(?:\s+me)?)\s+(?:on\s+)?(?:the\s+|my\s+|our\s+)?(.*?)\s*${LIST_WORD_EN}[?]*$`,
        "iu",
      ),
    ) ??
    text.match(
      new RegExp(
        String.raw`^(?:eh|eih|eah)\s+(?:elly\s+)?(?:f|fe|fel|fl)\s*${FRANCO_LIST}\s*(.*?)[?]*$`,
        "iu",
      ),
    );
  if (show) return { kind: "show", hint: tailHint(show[1]) };

  // Going shopping: "نازل السوبر ماركت" / "رايحة السوق" / "I'm going to the supermarket" / "nazel el supermarket".
  const shop = String.raw`(?:ال)?(?:سوبر\s?ماركت|سوبرماركت|سوق|بقالة|بقال|هايبر|كارفور|مشتريات|صيدلية|صيدليه|فرن|جزار)`;
  if (
    new RegExp(
      String.raw`^(?:انا\s+|أنا\s+)?(?:نازل|نازلة|نازله|رايح|رايحة|رايحه|هنزل|هروح)\s+(?:ل|على|عال)?${shop}(?:\s+(?:دلوقتي|حالا|كمان\s+شوية|كمان\s+شويه))?[.!]*$`,
      "u",
    ).test(text) ||
    /^(?:i'?m|i\s+am|im)\s+(?:going|heading|off)\s+(?:to\s+(?:the\s+)?)?(?:supermarket|market|grocery(?:\s+store)?|groceries|store|shops?|shopping|pharmacy|bakery)(?:\s+now)?[.!]*$/iu.test(
      text,
    ) ||
    /^(?:ana\s+)?(?:nazel|nazla|rayeh|ray7|raye7|raye7a|ray7a)\s+(?:el\s*)?(?:supermarket|super\s*market|soo2|souq|soq|market|carrefour|saydaleya|sayd[ae]leya)(?:\s+(?:dlw2ty|delwa2ty|dlwa2ty))?[.!]*$/iu.test(
      text,
    )
  ) {
    const m = text.match(/(صيدلي[ةه]|pharmacy|sayd[ae]leya|فرن|bakery|جزار)/iu);
    return { kind: "trip", hint: m ? m[1]! : null };
  }

  if (NOT_ADD.test(` ${text} `)) return null;

  // Add, Arabic: "ضيف بيض ولبن للقايمة" / "اكتب في القايمة عيش" / "حط رز على الليستة".
  const verb = String.raw`(?:ضيف|ضيفي|ضيفلي|ضيفيلي|زود|زودي|حط|حطي|حطلي|اكتب|اكتبي|سجل|سجلي)`;
  const prep = String.raw`(?:في|ف|على|عال|ع|ل|لل)\s*`;
  let m = text.match(
    new RegExp(String.raw`^${verb}\s+(.+?)\s+${prep}${LIST_WORD}\s*(.*)$`, "u"),
  );
  if (m) return addOf(m[1]!, m[2]);
  m = text.match(
    new RegExp(
      String.raw`^${verb}\s+${prep}${LIST_WORD}(?:\s+(\S+))?\s*[:：]\s*(.+)$`,
      "u",
    ),
  );
  if (m) return addOf(m[2]!, m[1]);
  m = text.match(
    new RegExp(String.raw`^${verb}\s+${prep}${LIST_WORD}\s+(.+)$`, "u"),
  );
  if (m) return addOf(m[1]!, null);

  // Add, English: "add eggs and milk to the shopping list" / "put rice on the list".
  m = text.match(
    new RegExp(
      String.raw`^(?:please\s+)?(?:add|put|write)\s+(.+?)\s+(?:to|on|in)\s+(?:the\s+|my\s+|our\s+)?(.*?)\s*${LIST_WORD_EN}[.!]*$`,
      "iu",
    ),
  );
  if (m) return addOf(m[1]!, m[2]);

  // Add, Franco: "dif beid w laban lel list" / "7ot roz fel list".
  m = text.match(
    new RegExp(
      String.raw`^(?:dif|deef|zawed|7ot|hot|ekteb)\s+(.+?)\s+(?:lel|lil|fel|fl|3al|3la|3ala)\s*${FRANCO_LIST}\s*(.*)$`,
      "iu",
    ),
  );
  if (m) return addOf(m[1]!, m[2]);

  return null;
}

function addOf(
  things: string,
  hint: string | null | undefined,
): ListIntent | null {
  const list = splitThings(things);
  return list.length
    ? { kind: "add", things: list, hint: tailHint(hint ?? undefined) }
    : null;
}

/** "جبت العيش واللبن" / "got the eggs": names to tick off, only when every one is on a list (checked by the caller). */
export function readGot(input: string): string[] | null {
  const text = clean(input);
  const m =
    text.match(/^(?:جبت|جيبت|اشتريت|خدت)\s+(.+?)[.!]*$/u) ??
    text.match(/^(?:i\s+)?(?:got|bought|picked\s+up)\s+(.+?)[.!]*$/iu) ??
    text.match(/^(?:gebt|gbt|eshtarait|eshtareet)\s+(.+?)[.!]*$/iu);
  if (!m || /\d/.test(m[1]!)) return null; // amounts are money talk (the money fast path)
  const things = splitThings(m[1]!).map((t) => t.title);
  return things.length && things.length <= 10 ? things : null;
}

/** A place word in a hint, for picking the list: "الصيدلية" → pharmacy. */
export function placeOf(hint: string | null): ListPlace | null {
  if (!hint) return null;
  if (/صيدلي|pharmacy|sayd/iu.test(hint)) return "pharmacy";
  if (/فرن|عيش|مخبز|bakery/iu.test(hint)) return "bakery";
  if (/جزار|لحم|butcher/iu.test(hint)) return "butcher";
  if (/بقال|سوبر|سوق|grocer|market|super/iu.test(hint)) return "grocery";
  if (/بيت|منزل|home|house/iu.test(hint)) return "home";
  return null;
}
