# Zaki launch notes

Target: build done about 10 Jan 2027, Play closed test (12 testers for 14 days) about
8 to 22 Jan, public launch about 26 Jan 2027. Ramadan pack opens 25 Jan 2027.

## Before launch (in order)

1. Server settings (hosting dashboard, never in the repo):
   - `PUBLIC_URL`: the domain used in invite and Daftar links.
   - `ANDROID_STORE_URL`: the Play Store page, shown on the web confirm pages.
   - `LEGAL_OPERATOR`, `LEGAL_CONTACT_EMAIL`: shown on the terms and privacy pages.
   - `LEGAL_REVIEWED=1`: only after a lawyer has read both pages (removes the draft notice).
   - `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `ADMIN_PASSWORD`, `SENTRY_DSN`.
   - `EXPO_ACCESS_TOKEN` and FCM credentials, so pushes from Zaki reach phones.
   - `SESSION_ENABLED`: leave unset. See step 3.
2. Store products (Play Console, then RevenueCat): `zaki_pro_monthly`, `zaki_pro_yearly`,
   `zaki_family_monthly`, `zaki_family_yearly`, `zaki_founders_yearly`.
3. Real-model evals. These need a funded model key and have NOT been run for the Zaki
   voice or for Session:
   - `ANTHROPIC_API_KEY=... npm run eval` (137 chat cases and 32 Session cases).
   - Read every failed case. The wellbeing and Session safety cases must all pass.
   - Only then set `SESSION_ENABLED=1`. Until then Session stays hidden for everyone.
   A full run costs well under one US dollar on the small model.
4. Update the live server to `main` and run `npx prisma migrate deploy`.
5. New phone build: `eas build --profile preview --platform android` in apps/mobile,
   then walk through every screen on a real phone. No screen has been run on a phone
   since the Zaki milestones were built.
6. Play closed test with 12 testers for 14 days, then production.

## Store listing

Short description (80 characters max)

- EN: Your cheerful AI friend who remembers, reminds, and keeps your people close.
- AR: صاحبك الذكي اللي بيفتكر، بيفكّرك، وبيقرّبك من أهلك وصحابك.

Full description (EN)

Zaki is a friend in your pocket. Tell Zaki what is on your mind the way you would text a
friend, in Arabic or English, and Zaki remembers it and reminds you at the right time.

- Reminders that feel human: errands, appointments, medicine, repeating reminders.
- Circles for family and friends: invite with one WhatsApp link, ask someone to do
  something, and see when it is done.
- One-tap check-ins: "I arrived", "took my medicine". Never your location.
- Shared Daftar: note who owes whom, let the other person confirm, and pay with your
  own InstaPay link. Zaki only keeps the record and never touches money.
- Trackers: water, prayers, spending and more, by tapping or by telling Zaki.
- Ramadan pack: fasting, prayers, Quran and charity trackers, and iftar invitations
  for your circle.

Circles, the Daftar and requests are free and unlimited. The free plan includes a daily
number of AI replies. Zaki Pro and Family (up to 6 people) remove the limit.

Zaki is an AI, not a person, and not a doctor. For ages 13 and up.

Full description (AR)

زكي صاحب في جيبك. احكيله اللي في بالك زي ما بتكتب لصاحبك، بالعربي أو بالإنجليزي، وهو
بيفتكر وبيفكّرك في الوقت المناسب.

- تذكيرات بطعم إنساني: مشاوير، مواعيد، دوا، وتذكيرات متكررة.
- دواير للعيلة والصحاب: دعوة بلينك واتساب واحد، اطلب حاجة من حد، واعرف لما تخلص.
- اطمئنان بدوسة: «وصلت»، «خدت الدوا». من غير مكانك خالص.
- الدفتر المشترك: سجّل مين عليه لمين، والطرف التاني يأكّد، والدفع بلينك إنستاباي
  بتاعك. زكي بيسجّل بس ومابيلمسش فلوس.
- المتابعة: المية، الصلاة، المصاريف وغيرها، بدوسة أو بكلمة لزكي.
- باقة رمضان: متابعة الصيام والصلاة والقرآن والصدقة، وعزومات فطار لدايرتك.

الدواير والدفتر والطلبات ببلاش ومن غير حدود. الباقة المجانية فيها عدد يومي من ردود
الذكاء الاصطناعي، وزكي برو والعيلة (لحد ٦ أفراد) بيشيلوا الحد.

زكي ذكاء اصطناعي، مش إنسان ومش دكتور. من سن ١٣ سنة.

Data safety form (Play): collects name, email, messages, and app activity; data is
encrypted in transit; users can export and delete everything from Settings. Session is
not mentioned in the listing while it is off.
