/**
 * Terms of Use and Privacy Policy, served by GET /legal/terms and /legal/privacy
 * (routes/legal.ts) so the paywall and store listings have URLs to link to.
 *
 * DRAFT written from what the code does. It has not been reviewed by a lawyer: the pages
 * show a draft notice until LEGAL_REVIEWED=1. Update LAST_UPDATED with every change.
 */
export const LAST_UPDATED = "2026-11-22";

export type LegalLang = "ar" | "en";
export type LegalDoc = "terms" | "privacy";

export interface Section {
  heading: string;
  /** Paragraphs; a string starting with "- " is a list item. */
  body: string[];
}
export interface LegalPage {
  title: string;
  updatedLabel: string;
  draftNotice: string;
  contactLabel: string;
  contactMissing: string;
  sections: Section[];
}

const termsEn: LegalPage = {
  title: "Zaki — Terms of Use",
  updatedLabel: "Last updated",
  draftNotice: "Draft: these terms are still being finalised.",
  contactLabel: "Contact",
  contactMissing: "Contact details will be published here before launch.",
  sections: [
    {
      heading: "1. What Zaki is",
      body: [
        "Zaki is a mobile app in which you chat with an AI friend that remembers what you tell it and reminds you of your plans, errands and money owed.",
        "Zaki is an artificial intelligence, not a person. It can misunderstand you, get a date or an amount wrong, or miss a reminder. Check anything important yourself.",
      ],
    },
    {
      heading: "2. Not a professional or emergency service",
      body: [
        "Zaki does not give medical, psychological, legal or financial advice, and it is not a crisis service. If you or someone else is in danger, contact your local emergency services.",
        "Do not rely on Zaki alone for medicine, flights, exams, payments or anything else where a missed reminder would cause harm. Reminders depend on your phone's notification settings, battery settings and connection.",
      ],
    },
    {
      heading: "3. Your account",
      body: [
        "You can use the app on one phone without an account, or sign in so your chat is kept across devices. You are responsible for keeping access to your phone, email and phone number secure.",
        "You must be at least 13 years old to use Zaki, or older where your country's law requires it.",
      ],
    },
    {
      heading: "4. Free plan and subscriptions",
      body: [
        "Zaki is free to use. The free plan includes a limited number of AI replies per day (more during your first week). A paid subscription (Zaki Pro, or Family for up to 6 people) removes that daily limit, within fair use, and unlocks extra features. Inviting friends can earn you free Pro days.",
        "Subscriptions are sold through the Apple App Store or Google Play and are charged to your store account. They renew automatically for the same period unless you cancel in your store account settings at least 24 hours before the current period ends. We tell you before the trial ends.",
        "Prices are shown in the app before you buy and may differ by country. Refunds are handled by Apple or Google under their policies.",
        "If your subscription ends, you go back to the free plan. You can still use the app and read, export and delete everything you saved.",
      ],
    },
    {
      heading: "5. Acceptable use",
      body: [
        "- Do not use Zaki to break the law or to harm, harass or deceive anyone.",
        "- Do not try to disrupt the service, get around its limits, or access other people's data.",
        "- Zaki is for daily life. It limits how many messages you can send per day and may pause replies if that limit is passed.",
      ],
    },
    {
      heading: "6. Your content",
      body: [
        "What you write stays yours. You give us permission to store and process it only to run the service for you, as described in the Privacy Policy.",
        "You can export or delete your data at any time from Settings.",
      ],
    },
    {
      heading: "7. Availability and changes",
      body: [
        "We work to keep Zaki running but do not promise it will always be available or free of errors. We may change or remove features, and we may suspend accounts that break these terms.",
        "If we make an important change to these terms we will tell you in the app. Continuing to use Zaki after that means you accept the new terms.",
      ],
    },
    {
      heading: "8. Liability",
      body: [
        "To the extent the law allows, Zaki is provided as it is, and we are not liable for indirect losses or for losses caused by a missed, late or mistaken reminder or reply. Nothing in these terms removes rights you have under the consumer law of your country.",
      ],
    },
  ],
};

const privacyEn: LegalPage = {
  title: "Zaki — Privacy Policy",
  updatedLabel: "Last updated",
  draftNotice: "Draft: this policy is still being finalised.",
  contactLabel: "Contact",
  contactMissing: "Contact details will be published here before launch.",
  sections: [
    {
      heading: "1. What we collect",
      body: [
        "- What you write: your messages, and the reminders, tasks, shopping items, notes, money owed and memories Zaki saves from them. These can include details about other people you mention.",
        "- Account details: your email address or phone number, or your Apple or Google account identifier, if you sign in. Without sign-in, a random identifier created on your phone.",
        "- Settings: your name if you give it, language, time zone, wake and sleep times, and tone preference.",
        "- Circles: the circles you create or join, their names and members. Other members of a circle see your name. Anyone who has an invite link sees the name of the person who sent it and the name of the circle.",
        "- Shared Daftar: the name, amount and note you enter for a debt, your InstaPay payment link if you add one, and the other person's answer. Anyone who has the link you send sees your name, the amount and the note. Zaki only keeps the record: it never holds or moves money, and payments happen in InstaPay.",
        "- Your phone's notification token, so we can send you messages from Zaki.",
        "- Subscription status from Apple or Google. We never see your card details.",
        "- Technical records: error reports and counts of events such as replies and their cost. These do not contain the text of your messages.",
        "The app accepts text only. It does not access your microphone, camera, photos, contacts or location.",
      ],
    },
    {
      heading: "2. How we use it",
      body: [
        "- To reply to you, remember what you told Zaki, and remind you at the right time.",
        "- To keep your chat in sync across your devices.",
        "- To manage your subscription, prevent abuse and fix errors.",
        "We do not sell your data and we do not use it for advertising.",
      ],
    },
    {
      heading: "3. Who processes it for us",
      body: [
        "- Anthropic: to write each reply, your recent messages and the saved context needed to answer are sent to Anthropic's Claude AI service.",
        "- Supabase: stores the database and handles sign-in. The database is hosted in the European Union (Ireland).",
        "- Our hosting provider: runs the Zaki server.",
        "- Expo, Apple and Google: deliver push notifications.",
        "- RevenueCat, Apple and Google: process subscriptions.",
        "- Sentry: receives crash and error reports, with message content collection turned off.",
        "- The SMS or email provider that delivers your sign-in code.",
        "These providers may process data outside your country.",
      ],
    },
    {
      heading: "4. Where it is kept and for how long",
      body: [
        "Your chat is stored on your phone and on our servers. We keep it until you delete it or delete your account. After deletion, copies may remain in provider backups for a limited time before they are overwritten.",
      ],
    },
    {
      heading: "5. Your choices",
      body: [
        "- Export: download everything Zaki has saved about you from Settings.",
        "- Delete: delete individual items or memories, or delete your account and all its data from Settings.",
        "- Notifications: turn them off in your phone's settings at any time.",
        "You can also contact us to ask for access, correction or deletion.",
      ],
    },
    {
      heading: "6. Sensitive topics",
      body: [
        "You may choose to tell Zaki about your health, family or money. That is stored and processed like the rest of your chat. Please do not share passwords, card numbers or government ID numbers.",
        "If a message suggests you may be in danger, Zaki shows a helpline number. We record that this happened, without the text of the message.",
      ],
    },
    {
      heading: "7. Children",
      body: ["Zaki is not intended for children under 13, and we do not knowingly collect their data."],
    },
    {
      heading: "8. Changes",
      body: ["If we change this policy in an important way we will tell you in the app before the change takes effect."],
    },
  ],
};

const termsAr: LegalPage = {
  title: "زكي — شروط الاستخدام",
  updatedLabel: "آخر تحديث",
  draftNotice: "مسودة: الشروط دي لسه تحت المراجعة.",
  contactLabel: "للتواصل",
  contactMissing: "بيانات التواصل هتتنشر هنا قبل الإطلاق.",
  sections: [
    {
      heading: "١. زكي إيه",
      body: [
        "زكي تطبيق موبايل بتتكلم فيه مع صاحب بالذكاء الاصطناعي، بيفتكر اللي بتقوله وبيفكّرك بمواعيدك ومشاويرك والفلوس اللي ليك أو عليك.",
        "زكي ذكاء اصطناعي، مش إنسان. ممكن يفهمك غلط، أو يغلط في تاريخ أو مبلغ، أو يفوّت تذكير. أي حاجة مهمة راجعها بنفسك.",
      ],
    },
    {
      heading: "٢. مش خدمة متخصصة ولا طوارئ",
      body: [
        "زكي مش بيقدّم نصيحة طبية أو نفسية أو قانونية أو مالية، ومش خدمة أزمات. لو إنت أو حد تاني في خطر، اتصل بالطوارئ في بلدك.",
        "ماتعتمدش على زكي لوحده في الدوا أو الطيران أو الامتحانات أو المدفوعات أو أي حاجة تفويتها يسبب ضرر. التذكيرات بتعتمد على إعدادات الإشعارات والبطارية والنت في موبايلك.",
      ],
    },
    {
      heading: "٣. حسابك",
      body: [
        "تقدر تستخدم التطبيق على موبايل واحد من غير حساب، أو تدخل بحساب عشان الشات يتحفظ على كل أجهزتك. إنت المسؤول عن تأمين موبايلك وإيميلك ورقمك.",
        "لازم يكون سنك ١٣ سنة على الأقل عشان تستخدم زكي، أو أكبر لو قانون بلدك بيطلب كده.",
      ],
    },
    {
      heading: "٤. الباقة المجانية والاشتراكات",
      body: [
        "زكي ببلاش. الباقة المجانية فيها عدد محدود من ردود الذكاء الاصطناعي في اليوم (وأكتر في أول أسبوع). الاشتراك المدفوع (زكي برو، أو باقة العيلة لحد ٦ أفراد) بيشيل الحد اليومي ده في حدود الاستخدام المعقول، وبيفتح خصائص زيادة. ولما تعزم صحابك ممكن تاخد أيام برو ببلاش.",
        "الاشتراك بيتباع عن طريق Apple App Store أو Google Play وبيتخصم من حسابك في المتجر. بيتجدد لوحده لنفس المدة لحد ما تلغيه من إعدادات حسابك في المتجر قبل نهاية المدة بـ ٢٤ ساعة على الأقل. هنقولك قبل ما التجربة تخلص.",
        "الأسعار بتظهر في التطبيق قبل الشراء وممكن تختلف من بلد لبلد. استرجاع الفلوس بيتم عن طريق Apple أو Google حسب سياستهم.",
        "لو الاشتراك خلص، بترجع للباقة المجانية. تقدر تكمّل استخدام التطبيق وتقرا وتصدّر وتمسح كل اللي اتحفظ.",
      ],
    },
    {
      heading: "٥. الاستخدام المقبول",
      body: [
        "- ماتستخدمش زكي في مخالفة القانون أو أذى أو مضايقة أو خداع أي حد.",
        "- ماتحاولش تعطّل الخدمة أو تتخطى حدودها أو توصل لبيانات ناس تانية.",
        "- زكي معمول للحياة اليومية. فيه حد أقصى للرسائل في اليوم، والردود ممكن تقف لو عدّيته.",
      ],
    },
    {
      heading: "٦. المحتوى بتاعك",
      body: [
        "اللي بتكتبه ملكك. إنت بتسمحلنا نحفظه ونعالجه بس عشان نشغّل الخدمة ليك، زي ما هو موضّح في سياسة الخصوصية.",
        "تقدر تصدّر أو تمسح بياناتك في أي وقت من الإعدادات.",
      ],
    },
    {
      heading: "٧. توفّر الخدمة والتغييرات",
      body: [
        "بنحاول نخلّي زكي شغال دايماً، بس مانقدرش نضمن إنه هيفضل متاح على طول أو من غير أخطاء. ممكن نغيّر أو نشيل خصائص، وممكن نوقف الحسابات اللي بتخالف الشروط دي.",
        "لو عملنا تغيير مهم في الشروط هنقولك في التطبيق. استمرارك في استخدام زكي بعدها معناه إنك موافق على الشروط الجديدة.",
      ],
    },
    {
      heading: "٨. المسؤولية",
      body: [
        "في حدود اللي القانون بيسمح بيه، زكي متقدّم زي ما هو، ومش مسؤولين عن الخسائر غير المباشرة أو الخسائر اللي تحصل بسبب تذكير أو رد اتفوّت أو اتأخر أو كان غلط. مفيش حاجة في الشروط دي بتلغي حقوقك حسب قانون حماية المستهلك في بلدك.",
      ],
    },
  ],
};

const privacyAr: LegalPage = {
  title: "زكي — سياسة الخصوصية",
  updatedLabel: "آخر تحديث",
  draftNotice: "مسودة: السياسة دي لسه تحت المراجعة.",
  contactLabel: "للتواصل",
  contactMissing: "بيانات التواصل هتتنشر هنا قبل الإطلاق.",
  sections: [
    {
      heading: "١. بنجمع إيه",
      body: [
        "- اللي بتكتبه: رسائلك، والتذكيرات والمهام وحاجات التسوق والملاحظات والفلوس والذكريات اللي زكي بيحفظها منها. ده ممكن يشمل تفاصيل عن ناس تانية بتذكرهم.",
        "- بيانات الحساب: إيميلك أو رقم موبايلك، أو معرّف حسابك في Apple أو Google، لو دخلت بحساب. من غير حساب، بنستخدم معرّف عشوائي بيتعمل على موبايلك.",
        "- الإعدادات: اسمك لو قلته، اللغة، المنطقة الزمنية، مواعيد الصحيان والنوم، وطريقة الكلام اللي بتفضّلها.",
        "- الدواير: الدواير اللي بتعملها أو بتدخلها، وأساميها وأفرادها. باقي أفراد الدايرة بيشوفوا اسمك. وأي حد معاه لينك الدعوة بيشوف اسم اللي بعته واسم الدايرة.",
        "- الدفتر المشترك: الاسم والمبلغ والملاحظة اللي بتكتبهم، ولينك إنستاباي بتاعك لو ضفته، ورد الشخص التاني. أي حد معاه اللينك اللي بتبعته بيشوف اسمك والمبلغ والملاحظة. زكي بيسجّل بس: مش بيمسك فلوس ولا بيحوّلها، والدفع بيتم في إنستاباي.",
        "- رمز الإشعارات بتاع موبايلك، عشان نبعتلك رسائل زكي.",
        "- حالة الاشتراك من Apple أو Google. عمرنا ما بنشوف بيانات الكارت.",
        "- سجلات تقنية: تقارير الأخطاء وأعداد أحداث زي الردود وتكلفتها. السجلات دي مافيهاش نص رسائلك.",
        "التطبيق بيقبل كتابة بس. مش بيستخدم المايك ولا الكاميرا ولا الصور ولا جهات الاتصال ولا الموقع.",
      ],
    },
    {
      heading: "٢. بنستخدمها في إيه",
      body: [
        "- عشان نرد عليك، ونفتكر اللي قلته لزكي، ونفكّرك في الوقت المناسب.",
        "- عشان الشات يفضل متزامن على أجهزتك.",
        "- عشان ندير اشتراكك ونمنع إساءة الاستخدام ونصلّح الأخطاء.",
        "مش بنبيع بياناتك ومش بنستخدمها في الإعلانات.",
      ],
    },
    {
      heading: "٣. مين بيعالجها معانا",
      body: [
        "- Anthropic: عشان يتكتب كل رد، رسائلك الأخيرة والمعلومات المحفوظة اللازمة للرد بتتبعت لخدمة الذكاء الاصطناعي Claude من Anthropic.",
        "- Supabase: بتخزّن قاعدة البيانات وبتدير تسجيل الدخول. قاعدة البيانات موجودة في الاتحاد الأوروبي (أيرلندا).",
        "- شركة الاستضافة: بتشغّل سيرفر زكي.",
        "- Expo و Apple و Google: بيوصّلوا الإشعارات.",
        "- RevenueCat و Apple و Google: بيديروا الاشتراكات.",
        "- Sentry: بيستقبل تقارير الأعطال والأخطاء، وجمع محتوى الرسائل مقفول.",
        "- شركة الرسائل أو الإيميل اللي بتوصّلك كود الدخول.",
        "الشركات دي ممكن تعالج البيانات برّه بلدك.",
      ],
    },
    {
      heading: "٤. بتتحفظ فين ولحد إمتى",
      body: [
        "الشات بيتحفظ على موبايلك وعلى سيرفراتنا. بنحتفظ بيه لحد ما تمسحه أو تمسح حسابك. بعد المسح، ممكن تفضل نسخ في النسخ الاحتياطية عند مزوّدي الخدمة لفترة محدودة لحد ما تتمسح.",
      ],
    },
    {
      heading: "٥. اختياراتك",
      body: [
        "- التصدير: نزّل كل اللي زكي حفظه عنك من الإعدادات.",
        "- المسح: امسح أي حاجة أو ذكرى لوحدها، أو امسح حسابك وكل بياناته من الإعدادات.",
        "- الإشعارات: اقفلها من إعدادات موبايلك في أي وقت.",
        "وتقدر تتواصل معانا عشان تطلب نسخة من بياناتك أو تصحيحها أو مسحها.",
      ],
    },
    {
      heading: "٦. المواضيع الحساسة",
      body: [
        "ممكن تختار تحكي لزكي عن صحتك أو أهلك أو فلوسك. ده بيتحفظ ويتعالج زي باقي الشات. من فضلك ماتكتبش كلمات سر أو أرقام كروت أو أرقام بطاقات.",
        "لو رسالة بتوحي إنك ممكن تكون في خطر، زكي بيعرض رقم خط مساعدة. بنسجّل إن ده حصل، من غير نص الرسالة.",
      ],
    },
    {
      heading: "٧. الأطفال",
      body: ["زكي مش معمول للأطفال أقل من ١٣ سنة، ومش بنجمع بياناتهم واحنا عارفين."],
    },
    {
      heading: "٨. التغييرات",
      body: ["لو غيّرنا السياسة دي تغيير مهم هنقولك في التطبيق قبل ما يتطبّق."],
    },
  ],
};

export const LEGAL: Record<LegalDoc, Record<LegalLang, LegalPage>> = {
  terms: { ar: termsAr, en: termsEn },
  privacy: { ar: privacyAr, en: privacyEn },
};
