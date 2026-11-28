/**
 * Terms of Use and Privacy Policy, served by GET /legal/terms and /legal/privacy
 * (routes/legal.ts) so the paywall and store listings have URLs to link to.
 *
 * DRAFT written from what the code does. It has not been reviewed by a lawyer: the pages
 * show a draft notice until LEGAL_REVIEWED=1. Update LAST_UPDATED with every change.
 */
export const LAST_UPDATED = "2026-11-23";

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
        "- Settings: your name if you give it, language, time zone, wake and sleep times, tone preference, and whether Zaki should address you as female or male in Arabic, if you choose; and the city you pick (a city from a list, never your location), which sets prayer times, holidays and the currency.",
        "- Daily news: the topics you pick and the time you want the brief. The news itself comes from public news feeds and is summarised once for everyone who follows a topic: nothing about you is sent to the news sources or used to choose what you see.",
        "- Circles: the circles you create or join, their names and members. Other members of a circle see your name. Anyone who has an invite link sees the name of the person who sent it, the name of the circle, the first names of its members and how many tasks are open in it.",
        "- Shared Daftar: the name, amount and note you enter for a debt, your InstaPay payment link if you add one, and the other person's answer. Anyone who has the link you send sees your name, the amount and the note. Zaki only keeps the record: it never holds or moves money, and payments happen in InstaPay.",
        "- Gam'eya: the name, monthly amount, pay day, the members' names in turn order, who paid each month and who received the pot. Members who use Zaki see the book in the app; anyone with the gam'eya's link sees the names, turns and who paid, and can say they paid. Zaki only keeps the record: it never holds or moves money.",
        "- Split the bill: the title, the names you type, the items, prices and shares. Anyone with the link sees these and can add their own name and items. Homework: what a child hands in (text, a link or photos of the pages) and the parent's review, seen only by the two of them.",
        "- Links for people not on Zaki: a task you send by link (the name you type, what to do, by when, a note, and their answer) and a household list you share by link. Anyone with the link sees the task and your name, or the list and its things, and can answer, tick and add, with a name if they type one; that name is kept on the item and remembered in their browser for the list's page. You can cancel a task link or stop a list link at any time.",
        "- Photos (receipts and homework only): only if you tap to take or pick one, your phone asks for camera or photos permission then. A receipt photo is sent once to our AI provider to read the place, total and items, then thrown away: we never store it, and you confirm what gets saved. Homework page photos are stored so the child and the parent who set the homework can see them, nobody else, and are deleted automatically 90 days after upload (or sooner if you delete your account).",
        "- Homework help: when a parent asks Zaki to explain a lesson, or a child asks Zaki to look at their answers before handing in, the words and any page photos are sent once to our AI provider for that answer, then thrown away: we never store them. Only a count (that it happened, how many photos) is kept.",
        "- Pocket money: the reward a parent sets on a homework, what the child earned when it was marked Well done, and what the parent marked as handed over, seen only by that parent and child. It is a record: Zaki never holds or moves money.",
        "- Share pictures: when you tap share, we draw a picture with your streak number or the split's title and total, and your invite link. Anyone with its link can open it.",
        "- Contacts: only if you tap \"Pick from contacts\". Your phone asks for permission then, and Zaki reads only the name of the one contact you pick, to fill in the field. Your contact list is never uploaded.",
        "- Requests in circles: the task you ask a circle member to do, its date, and their answer. Only the two of you see a request until it is accepted; after that the circle sees it, and Zaki posts a short line there under its own name.",
        "- Household lists: the lists you make or are in (name, kind of shop), the things on them, who added and who ticked off each one, and when someone says they are going shopping. A circle's list is seen by everyone in that circle; a private list only by you. Ticked things stay visible for a day.",
        "- Medicine times (care circles): the medicines a family adds for someone (that person's name, the medicine's name and dose as you write them, the times, a note), who gets the reminder, and each dose marked taken or skipped, by whom and when. Everyone in that circle sees them. This is health information you choose to share: it is used only for the reminders and the record, never sent to our AI provider, and leaves with the circle or when the one who added it deletes it. Zaki reminds and keeps the record only; it never suggests or checks a medicine or a dose.",
        "- Trackers: what you choose to follow (water, prayers, spending and so on, or anything you name), each entry, whether you tap it or tell Zaki in chat, and the times you pick for Zaki to ask about it. Only you see your trackers, unless you share one with a circle: then its members see its name, today's progress and your streak. Money trackers are never shared.",
        "- Spending and income: the sections you create, their monthly budgets, and each amount and note you add, in the app or by telling Zaki in chat. Only you see your own sections. A section you share with a circle is a shared book: its members see every amount, note and who added it, and who owes whom. Zaki only keeps the record: it never holds or moves money.",
        "- Circle feed: your reactions and the short comments you write on what happens in a circle, and what you ask Zaki there. The members of that circle see them. When you ask Zaki to remind everyone, your words go to each member's chat.",
        "- Homework and reminder times in requests: the description or link you add to a homework request and the time you pick for Zaki's reminder, which the other person sees.",
        "- Check-ins and family roles: the check-ins you tap (for example \"arrived\" or \"took my medicine\"), which the members of that circle see, and the family role you pick, if any. A check-in is only the words you choose: Zaki never collects or tracks your location.",
        "- Session (a space to reflect, for ages 18 and up): only if you give separate consent, we keep the mood you tap and what you and Zaki write there, so the conversation can continue. This is sensitive data: it is stored apart from the rest of your data, is sent to our AI provider only to write Zaki's reply, is never shown to your circles, is never used for anything else, and you can delete all of it with one tap inside Session. Zaki is not a doctor, and Session is not medical or psychological care.",
        "- Invitations in circles: an iftar invitation you send (its date and note) and each member's yes or no, which the members of that circle see.",
        "- Your phone's notification token, so we can send you messages from Zaki.",
        "- Subscription status from Apple or Google. We never see your card details.",
        "- Technical records: error reports and counts of events such as replies and their cost, which screens you open and which buttons you tap, and what kind of thing a chat message did (for example \"a reminder was saved\"). These never contain the text of your messages, names or amounts.",
        "- Invite links: your personal invite link shows your first name to whoever opens it. When a friend joins through it, we record that you invited them.",
        "The app takes text, plus photos only for receipts and homework as described above. Voice typing turns your voice into words on your phone: the audio is never saved or sent. If you save places for place reminders (\"remind me when I'm at the supermarket\"), your phone uses its location to notice when you arrive at or leave one of them, also while the app is closed if you allow it. Your saved places and your location stay on your phone and are never sent to us or to anyone; only the words of the reminder (for example \"the supermarket\") are stored with it, and an \"arrived\" check-in goes to your circle only when you tap it. The app opens the camera, your photos or your contacts only when you tap to use them.",
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
        "- الإعدادات: اسمك لو قلته، اللغة، المنطقة الزمنية، مواعيد الصحيان والنوم، وطريقة الكلام اللي بتفضّلها، وزكي يكلمك بالمؤنث ولا بالمذكر لو اخترت، والمدينة اللي بتختارها من القايمة (مش مكانك)، وبيها بنظبط مواعيد الصلاة والإجازات والعملة.",
        "- أخبارك كل يوم: المواضيع اللي بتختارها والساعة اللي عايز الأخبار فيها. الأخبار نفسها جاية من مواقع أخبار عامة وبتتلخّص مرة واحدة لكل اللي متابعين الموضوع: مفيش أي حاجة عنك بتتبعت لمواقع الأخبار ولا بتتستخدم عشان تختار اللي يوصلك.",
        "- الدواير: الدواير اللي بتعملها أو بتدخلها، وأساميها وأفرادها. باقي أفراد الدايرة بيشوفوا اسمك. وأي حد معاه لينك الدعوة بيشوف اسم اللي بعته واسم الدايرة والاسم الأول لأفرادها وعدد المهام الشغالة فيها.",
        "- الدفتر المشترك: الاسم والمبلغ والملاحظة اللي بتكتبهم، ولينك إنستاباي بتاعك لو ضفته، ورد الشخص التاني. أي حد معاه اللينك اللي بتبعته بيشوف اسمك والمبلغ والملاحظة. زكي بيسجّل بس: مش بيمسك فلوس ولا بيحوّلها، والدفع بيتم في إنستاباي.",
        "- الجمعية: اسمها والقسط ويوم الدفع وأسماء الناس بترتيب الأدوار، ومين دفع كل شهر ومين قبض. اللي على زكي بيشوفوها في التطبيق، وأي حد معاه لينك الجمعية بيشوف الأسماء والأدوار ومين دفع، ويقدر يقول إنه دفع. زكي بيسجّل بس: مش بيمسك فلوس ولا بيحوّلها.",
        "- قسّم الحساب: الاسم والأسامي اللي بتكتبها والطلبات والأسعار ونصيب كل واحد. أي حد معاه اللينك بيشوفهم ويقدر يضيف اسمه وطلباته. الواجب: اللي الطفل بيسلّمه (كلام أو لينك أو صور الصفحات) ورأي الأهل فيه، ومحدش بيشوفه غيرهم هما الاتنين.",
        "- لينكات للي مش على زكي: المهمة اللي بتبعتها بلينك (الاسم اللي بتكتبه، المطلوب، قبل إمتى، الملاحظة، والرد) وقايمة البيت اللي بتبعت لينكها. أي حد معاه اللينك بيشوف المهمة واسمك، أو القايمة وحاجاتها، ويقدر يرد ويعلّم ويضيف، باسمه لو كتبه؛ الاسم ده بيتحفظ على الحاجة ويفتكره المتصفح بتاعه لصفحة القايمة. تقدر تلغي لينك المهمة أو توقّف لينك القايمة في أي وقت.",
        "- الصور (الفواتير والواجب بس): لو دوست تصوّر أو تختار صورة بس، والموبايل بيطلب إذن الكاميرا أو الصور ساعتها. صورة الفاتورة بتتبعت مرة واحدة لمزوّد الذكاء الاصطناعي بتاعنا عشان يقرا المكان والإجمالي والطلبات، وبعدين بتتمسح: مش بنحفظها، وإنت اللي بتأكد إيه اللي يتسجل. صور صفحات الواجب بتتحفظ عشان الطفل واللي بعتله الواجب يشوفوها، ومحدش غيرهم، وبتتمسح لوحدها بعد ٩٠ يوم من رفعها (أو قبل كده لو مسحت حسابك).",
        "- مساعدة الواجب: لما حد من الأهل يطلب من زكي يشرح درس، أو الطفل يطلب من زكي يبص على إجاباته قبل ما يسلّم، الكلام وأي صور صفحات بيتبعتوا مرة واحدة لمزوّد الذكاء الاصطناعي بتاعنا عشان الرد ده، وبعدين بيتمسحوا: مش بنحفظهم. بنحفظ بس إن ده حصل وعدد الصور.",
        "- المصروف: المكافأة اللي الأهل بيحطوها على الواجب، واللي الطفل كسبه لما الواجب اتعلّم عليه «برافو»، واللي الأهل علّموا إنه اتسلّم، ومحدش بيشوفهم غير الأب أو الأم ده والطفل. ده تسجيل بس: زكي عمره ما بيمسك فلوس ولا بيحوّلها.",
        "- صور المشاركة: لما تدوس شارك، بنعمل صورة فيها عدد أيامك ورا بعض أو اسم الحساب وإجماليه، ولينك الدعوة بتاعك. أي حد معاه لينكها يقدر يفتحها.",
        "- الأسماء اللي على موبايلك: بس لو دوست «اختار من الأسماء». ساعتها موبايلك بيطلب الإذن، وزكي بياخد اسم الشخص اللي اخترته بس عشان يكتبه في الخانة. قايمة الأسماء بتاعتك عمرها ما بتترفع.",
        "- الطلبات في الدواير: الحاجة اللي بتطلبها من حد في الدايرة، وميعادها، ورده. الطلب بيفضل بينكم انتو الاتنين لحد ما يتوافق عليه؛ بعدها الدايرة بتشوفه، وزكي بيكتب سطر قصير هناك باسمه.",
        "- قوايم البيت: القوايم اللي بتعملها أو موجود فيها (الاسم ونوع المحل)، والحاجات اللي عليها، ومين ضاف ومين شطب كل حاجة، ولما حد يقول إنه نازل يشتري. قايمة الدايرة بيشوفها كل اللي في الدايرة، والقايمة الخاصة إنت بس. الحاجات المشطوبة بتفضل باينة يوم واحد.",
        "- مواعيد الدوا (دواير الرعاية): الأدوية اللي العيلة بتضيفها لحد (اسمه، واسم الدوا والجرعة زي ما بتكتبوها، والمواعيد، وملاحظة)، ومين بيوصله التفكير، وكل جرعة اتعلّم إنها اتاخدت أو اتفوّتت، ومين علّم وإمتى. كل اللي في الدايرة بيشوفوها. دي معلومات صحية إنتو اللي بتختاروا تشاركوها: بتتستخدم بس للتفكير والسجل، ومبتتبعتش لمزوّد الذكاء الاصطناعي أبداً، وبتتمسح مع الدايرة أو لما اللي ضافها يمسحها. زكي بيفكّر ويسجّل بس: عمره ما بيقترح دوا أو جرعة ولا بيراجعهم.",
        "- المتابعة: الحاجات اللي بتختار تتابعها (المية، الصلاة، المصاريف وغيرها، أو أي حاجة تسمّيها) وكل تسجيل فيها، سواء بدوسة أو لما تقول لزكي في الدردشة، والمواعيد اللي بتختارها عشان زكي يسألك. إنت بس اللي بتشوف متابعاتك، إلا لو شاركت واحدة مع دايرة: ساعتها أفرادها بيشوفوا اسمها وتقدّم النهارده والأيام ورا بعض. متابعات الفلوس عمرها ما بتتشارك.",
        "- المصاريف والدخل: الأقسام اللي بتعملها، وميزانية كل شهر، وكل مبلغ وملاحظة بتضيفها، من التطبيق أو لما تقول لزكي في الدردشة. إنت بس اللي بتشوف أقسامك. القسم اللي بتشاركه مع دايرة بيبقى دفتر مشترك: أفرادها بيشوفوا كل مبلغ وملاحظة ومين ضافها ومين على مين. زكي بيسجّل بس: مش بيمسك فلوس ولا بيحوّلها.",
        "- اللي بيحصل في الدايرة: تفاعلاتك والتعليقات القصيرة اللي بتكتبها على اللي بيحصل في الدايرة، واللي بتطلبه من زكي هناك. أفراد الدايرة دي بيشوفوهم. ولما تطلب من زكي يفكّر الكل، كلامك بيروح للشات بتاع كل فرد.",
        "- الواجب ومواعيد التذكير في الطلبات: التفاصيل أو اللينك اللي بتضيفه لطلب واجب، والميعاد اللي بتختاره لتذكير زكي، وبيشوفهم الشخص التاني.",
        "- الاطمئنان وأدوار العيلة: الاطمئنان اللي بتدوس عليه (زي «وصلت» أو «خدت الدوا») وبيشوفه أفراد الدايرة دي، ومكانك في العيلة لو اخترته. الاطمئنان هو الكلام اللي بتختاره بس: زكي عمره ما بيجمع ولا بيتتبّع مكانك.",
        "- مساحة ليك (للتفكير بصوت عالي، من سن 18): بس لو وافقت موافقة منفصلة، بنحفظ المزاج اللي بتختاره واللي بتكتبه إنت وزكي هناك عشان الكلام يكمّل. دي بيانات حساسة: بتتحفظ لوحدها بعيد عن باقي بياناتك، وبتتبعت لمزوّد الذكاء الاصطناعي بس عشان يكتب رد زكي، ومبتظهرش لدوايرك أبداً، ومبتتستخدمش في أي حاجة تانية، وتقدر تمسحها كلها بدوسة واحدة من جوه المساحة. زكي مش دكتور، والمساحة دي مش رعاية طبية ولا نفسية.",
        "- العزومات في الدواير: عزومة الفطار اللي بتبعتها (تاريخها وملاحظتها) ورد كل فرد بأيوه أو لأ، وبيشوفهم أفراد الدايرة دي.",
        "- رمز الإشعارات بتاع موبايلك، عشان نبعتلك رسائل زكي.",
        "- حالة الاشتراك من Apple أو Google. عمرنا ما بنشوف بيانات الكارت.",
        "- سجلات تقنية: تقارير الأخطاء وأعداد أحداث زي الردود وتكلفتها، والشاشات اللي بتفتحها والزراير اللي بتدوس عليها، ونوع اللي عملته رسالة في الشات (مثلاً «اتحفظ تذكير»). السجلات دي عمرها ما بتحتوي على نص رسائلك ولا أسامي ولا مبالغ.",
        "- لينكات الدعوة: لينك الدعوة الشخصي بتاعك بيوري اسمك الأول لأي حد يفتحه. ولما صاحب يدخل منه، بنسجّل إنك انت اللي دعيته.",
        "التطبيق بياخد كتابة، وصور للفواتير والواجب بس زي ما اتشرح فوق. الكتابة بالصوت بتحوّل صوتك لكلام على موبايلك، والصوت عمره ما بيتحفظ ولا بيتبعت. لو حفظت أماكن للتذكير بالمكان («فكرني لما أوصل السوبر ماركت»)، موبايلك بيستخدم موقعه عشان يعرف إنك وصلت مكان منهم أو خرجت منه، وكمان والتطبيق مقفول لو سمحت بكده. أماكنك المحفوظة وموقعك بيفضلوا على موبايلك ومبيتبعتوش لينا ولا لأي حد؛ اللي بيتحفظ مع التذكير هو كلامه بس (زي «السوبر ماركت»)، و«وصلت» بتتبعت لدايرتك بس لما تدوس. ومبيفتحش الكاميرا ولا الصور ولا جهات الاتصال غير لما تدوس عشان تستخدمها.",
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
