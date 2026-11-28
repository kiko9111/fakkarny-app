# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

- First users: a mom running a household in Egypt. She plans school, homework, shopping, money and her parents' medicine from her phone, mostly inside WhatsApp today, often with one hand and in short moments.
- Around her: her husband, children (including teens), brothers and sisters, friends. Many of them meet Zaki through a WhatsApp link before they install anything.
- Language: Egyptian Arabic first, right to left. English second. Franco-Arabic is read, never written back.
- Phones: mid-range Android first. iPhone runs the same app and the same design.

## Product Purpose

Zaki is an AI friend that remembers, reminds, and helps with family and friends. The user tells Zaki things in plain words; Zaki keeps them, reminds at the right time, and keeps the shared things of a family or a group (tasks, homework, lists, money, medicine times) in one place. Success is a household that runs through Zaki every day: weekly active circles is the north-star number.

## Positioning

"Zaki remembers so you don't have to." One chat with a warm character does every job in the app, and everything it saves has exactly one home that shows up in Today when it is due. Shared features are free; AI depth is paid.

## Operating Context

- The chat is the home and the front door. Five fixed tabs: Today, People, Zaki (centre), Daftar, Me.
- WhatsApp is the channel around the app: invites, debt confirmations, bill splits, task and list links, forwarded messages, all sent from the user's own number.
- Works offline: saved on the phone first, synced later. Reminders ring on the phone.
- Local habits are part of the product: the Daftar (who owes whom), the gam'eya, InstaPay, Ramadan, prayer times and holidays by city, school homework arriving as WhatsApp messages.

## Capabilities and Constraints

- Terms, one name per thing: Daftar / الدفتر, People / الناس, circle / دايرة, A space for you / مساحة ليك, Plans / مواعيدك, Today / النهارده.
- Text first; on-device voice typing; photos only for receipts and homework pages.
- Records only: Zaki never holds or moves money. Never medical advice. Session is never called therapy.
- Anything that reaches another person waits for the user's yes.
- New design must reach installed builds over the air: JavaScript and images only, no new native module unless optional.
- The layout rules in the repository's CLAUDE.md ("Layout map") are binding.

## Brand Commitments

- Name: Zaki / زكي. Character: super positive, warm, honest. Never guilt, never fake urgency.
- The spark-smile mark and the Zaki art, in the user's theme: Sunrise (default), Mint or Cloud.
- One font family: Rubik, Arabic and Latin.
- Far fewer words: no explainer sentences, no emoji on buttons, no ads.
- The friend never answers with a checklist unless asked for plans.

## Evidence on Hand

- A browser preview with sample data (`node scripts/build-web-preview.mjs`), Android test builds, the owner's own testing on a Pixel and an iPhone.
- No public users, reviews, testimonials or store listing yet: none may be invented.

## Product Principles

1. Say it once: the chat can do anything the screens can.
2. One home per thing; it shows in Today when it is due.
3. Nothing the user does waits for the server to be drawn.
4. Honest and kind: done means done, and no nagging.
5. People without the app can still answer.

## Accessibility & Inclusion

- Full right-to-left layout; Latin digits in Arabic.
- Text contrast of 4.5:1 or more on cards and on the background; touch targets of 48dp.
- The phone's "reduce motion" setting is honoured.
