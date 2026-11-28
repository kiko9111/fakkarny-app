---
name: Zaki
description: A warm friend's notebook, a soft colour mesh under white cards, one family of type, icons coloured by what they are about.
colors:
  # Theme: Sunrise (default). Mint and Cloud swap the same roles (see Colors).
  primary: "#C54315"
  primary-pressed: "#B53E14"
  primary-soft: "#FFE9DD"
  primary-ink: "#A9461E"
  on-primary: "#FFFFFF"
  ground: "#FFFAF5"
  surface: "rgba(255,255,255,0.86)"
  surface-strong: "rgba(255,255,255,0.96)"
  surface-solid: "#FFFFFF"
  surface-alt: "#F8F0EA"
  glass-edge: "rgba(255,255,255,0.95)"
  line: "#F1E8E1"
  line-strong: "#E6DAD0"
  ink: "#1D1B1A"
  ink-soft: "#5E5955"
  ink-faint: "#6C6762"
  mint-primary: "#0F7D67"
  mint-primary-ink: "#12705E"
  mint-primary-soft: "#E4F5F0"
  mint-ground: "#F7FCFA"
  cloud-primary: "#6F52E0"
  cloud-primary-ink: "#5B43C4"
  cloud-primary-soft: "#F0ECFE"
  cloud-ground: "#FAF8FF"
  # Fixed in every theme
  kind-money-bg: "#FFF0C7"
  kind-money-ink: "#855600"
  kind-people-bg: "#DCF3E5"
  kind-people-ink: "#1E7446"
  kind-place-bg: "#DEEAFF"
  kind-place-ink: "#2A5BBD"
  kind-alarm-bg: "#EBE5FD"
  kind-alarm-ink: "#5E44C4"
  family: "#1F786C"
  family-soft: "#E0F2EE"
  friends: "#9A600E"
  friends-soft: "#FCEFD8"
  calm: "#6650C8"
  calm-soft: "#EEEBFA"
  calm-ground: "#FAFAFD"
  ok: "#2B7A4B"
  ok-soft: "#E3F4E9"
  warn: "#8F5F00"
  warn-soft: "#FFF3D1"
  danger: "#C0362C"
  danger-soft: "#FDE8E6"
  whatsapp: "#177A41"
  scrim: "rgba(20,16,30,0.40)"
typography:
  display:
    fontFamily: "Rubik"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: "42px"
  title:
    fontFamily: "Rubik"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "32px"
  headline:
    fontFamily: "Rubik"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "26px"
  body:
    fontFamily: "Rubik"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "25px"
  bodyStrong:
    fontFamily: "Rubik"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "25px"
  small:
    fontFamily: "Rubik"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "21px"
  smallStrong:
    fontFamily: "Rubik"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "21px"
  caption:
    fontFamily: "Rubik"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: "18px"
  label:
    fontFamily: "Rubik"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "22px"
  number:
    fontFamily: "Rubik"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: "38px"
rounded:
  sm: "12px"
  md: "14px"
  lg: "22px"
  xl: "28px"
  pill: "999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "28px"
  xxxl: "40px"
components:
  button-filled:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "48px"
  button-filled-pressed:
    backgroundColor: "{colors.primary-pressed}"
  button-tonal:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "48px"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.pill}"
    height: "48px"
  button-whatsapp:
    backgroundColor: "{colors.whatsapp}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  list-row:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
    height: "64px"
  tile:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
    height: "104px"
  nav-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "56px"
    padding: "0 16px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.smallStrong}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 14px"
  chip-selected:
    backgroundColor: "{colors.primary-ink}"
    textColor: "{colors.on-primary}"
  segmented-track:
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "3px"
  segmented-part-selected:
    backgroundColor: "{colors.surface-solid}"
    textColor: "{colors.ink}"
    typography: "{typography.smallStrong}"
    rounded: "{rounded.pill}"
  text-field:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "0 16px"
  badge:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  header-plus:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.pill}"
    size: "44px"
  chat-tab-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    size: "62px"
  add-sheet:
    backgroundColor: "{colors.surface-solid}"
    rounded: "{rounded.xl}"
---

# Design System: Zaki

Recorded from the code on 2026-11-28 (apps/mobile/src/ui, src/app, assets). Scan mode. The
descriptive names and the North Star below were written from the code's own comments and
PRODUCT.md; the owner has not confirmed that wording (Questions skipped: delegated run). Values
are what the code does today, including the places where it departs from its own tokens.

## Overview

**Creative North Star: "The friend's notebook on a sunny table"** (proposed wording)

Zaki is an Operate surface: people come to do one small job with one hand. The look is light and
warm. A soft mesh of the user's theme sits behind every screen (an image, `Backdrop`); everything
the user reads or taps sits on white cards that let a breath of that colour through (white at
86%, a bright 1 px edge, a soft shadow tinted by the theme). Ink is near-black. The theme's own
colour is spent on few things: the one filled button, the raised chat button in the middle of the
tab bar, numbers on tiles, quiet buttons and the active tab.

Identity is carried by five things: the mesh ground, the spark-smile mark (Zaki's face on a
rounded tile, the same drawing as the app icon), Rubik in Arabic and Latin, pill buttons with a
faint top gloss, and small icons in soft squares coloured by what they are about.

There is one appearance: light. `userInterfaceStyle` is "light"; no dark scheme exists. The user
picks one of three themes (Sunrise, Mint, Cloud); the choice is read once at start-up and
changing it reloads the app. Session ("A space for you") keeps its own calm violet ground in
every theme.

**Key Characteristics:**
- Light mesh ground, white translucent cards, near-black ink.
- One type family (Rubik), four weights (400, 500, 600, 700).
- Geometry is round: cards 22, sheets and dialogs 28, fields 14, every button and chip a pill.
- Colour identifies: one Ionicon per meaning, in a square tinted by kind.
- Motion is small: a 220 ms fade and 10 px lift, once; loading keeps the page's shape.
- Full RTL; Egyptian Arabic first; Latin digits in both languages.
- No blur, gradient or SVG native module: mesh and Zaki art are images; motion is core `Animated`.

## Colors

A warm neutral page with one theme accent, plus four fixed "kind" hues and fixed colours for
family, friends and Session.

### Primary
- **Theme accent, fill** (`primary`): the filled button, the centre chat button, the tab badge,
  progress fills, the focus border of a text box, the pull-to-refresh spinner. A fill and an icon
  colour only.
- **Theme accent, ink** (`primary-ink`): words and icons in the theme's colour: tonal, outline
  and text buttons, tile numbers, section actions ("See all"), the header "+", a selected chip's
  fill.
- **Theme accent, soft** (`primary-soft`): tonal button fill (at 80% alpha), the default icon
  square, primary badge, pressed states.
- The three themes give these roles: Sunrise `#C54315 / #A9461E / #FFE9DD`, Mint
  `#0F7D67 / #12705E / #E4F5F0`, Cloud `#6F52E0 / #5B43C4 / #F0ECFE`. Each theme also sets its own
  ground, `surface-alt`, `line`, `line-strong` and three inks.

### Secondary (kinds, the same in every theme)
- **Money yellow** (`kind-money-*`): Daftar, debts, gam'eya, pocket money, payments.
- **People green** (`kind-people-*`): tasks, done, people, trackers, invites, medicine.
- **Place blue** (`kind-place-*`): places, splits, city.
- **Alarm violet** (`kind-alarm-*`): alarms, reminders, memory, privacy.
- **Neutral** (`surface-alt` + `ink-soft`): housekeeping rows (a code, an export, a setting).
- Anything else uses the theme's soft square and ink.

### Tertiary (fixed meanings)
- **Family teal** (`family`, `family-soft`): person avatars by default, chips with tone "family".
- **Friends amber** (`friends`, `friends-soft`): friends circles.
- **Calm violet** (`calm`, `calm-soft`, `calm-ground`): Session only.
- **State**: `ok` green (done, paid, taken), `warn` amber (waiting, late), `danger` red (delete,
  leave), each with a soft fill for badges and notes.
- **WhatsApp green** (`whatsapp`): the filled "send on WhatsApp" button only.

### Neutral
- **Ink** (`ink`): all primary text. **Ink soft**: second lines, labels above fields, section
  group titles. **Ink faint**: placeholders, chevrons, unticked rings; only a shade lighter than
  ink soft so it still passes 4.5:1.
- **Surface** (white 86%): cards, rows, tiles, chips, the tab bar. **Surface strong** (96%): text
  fields, dialogs, the header "+". **Surface solid**: sheets, the selected part of a switch.
- **Wash** (theme accent at 7%): a quiet fill inside a white card (switch track, progress track,
  notes, pressed rows).
- **Line strong**: hairlines inside a card and the border of an unselected chip. **Glass edge**
  (white 95%): the 1 px edge of every surface; invisible on white, so it is never used inside a
  card.

### Named Rules
**The Fill-Not-Words Rule.** `primary` is a fill and an icon colour, never small text. Words in
the theme's colour use `primary-ink`.

**The Kind Rule.** An icon's square says what the thing is about (money, people, place, alarm),
not which screen it is on. Kind colours never change with the theme.

**The 4.5 Rule.** Text is 4.5:1 or more on a card and on the mesh in all three themes (computed
2026-11-28: the lowest pairs are family on family-soft 4.57, friends on friends-soft 4.56, ok on
ok-soft 4.61). Re-compute after changing a theme colour or a mesh.

## Typography

**Display Font:** Rubik 700 (loaded at run time from @expo-google-fonts/rubik)
**Body Font:** Rubik 400 / 500 / 600
**Label/Mono Font:** none

**Character:** One rounded, friendly family that carries Arabic and Latin in the same files, so
both languages have the same weight and colour on the page. Line heights are generous for Arabic.

### Hierarchy
- **Display** (700, 30/42): onboarding and paywall heroes. Used twice in the app.
- **Number** (700, 30/38): the big amount at the top of a split, a gam'eya, a section.
- **Title** (700, 22/32): the value on a `Tile`, a profile name.
- **Headline** (600, 17/26): section headers, sheet titles, empty-state sentences.
- **Body** (400, 16/25) and **Body strong** (600, 16/25): chat text, row and card titles.
- **Small** (400, 14/21) and **Small strong** (600, 14/21): second lines, chips, switch parts,
  field labels, small buttons. `small` is the most used role in the app.
- **Label** (600, 15/22): button text (through `Button`).
- **Caption** (400, 12.5/18): tile lines, badges (set to 600 there), time stamps.

Sizes that live outside the scale today: tab screen header titles (700, 26), pushed screen header
titles (600, 18), tab bar labels (600, 12/18), tab badge (600, 11), text field input (400, 17;
`big` 700, 26), chat composer (400, 16/22), `NavRow` titles (500, 16). Weight 500 is used only by
`NavRow` titles.

All text goes through `Text` (`textBreakStrategy="simple"`, `writingDirection: "auto"`, start
alignment that follows the language). Sizes are density-independent and follow the system font
size; nothing sets a maximum font scale.

### Named Rules
**The One Family Rule.** Rubik only (owner decision). Hierarchy comes from size and weight, never
from a second face, letter-spacing or capitals.

**The Latin Digits Rule.** Numbers are Latin digits in Arabic too.

## Layout

One column on a phone, portrait only. A page (`Screen`) pads 16 on every side and stacks its
children with a 12 gap; the last thing clears the system bar by 40 plus the bottom inset. Cards
pad 16 with an 8 inner gap. Section headers add 12 above. Tiles sit two to a row with a 12
gutter and are at least 104 tall. Rows inside a grouped card are at least 56 tall with a 36
icon square; stand-alone list rows are 64 with a 44 icon square.

The spacing scale is 2, 4, 8, 12, 16, 20, 28, 40. Values built from it by sum also appear
(`sm + 2` = 10, `md + 2` = 14, `xs + 2` = 6).

Navigation: five fixed bottom tabs (Today, People, Zaki, Daftar, Me) with the Zaki chat as a
raised 62 round button in the middle; pushed screens use a stack header with a back arrow. Tab
headers hold a large title at the start and at most one round "+" (44) at the end, which opens a
bottom sheet of rows. A screen switches between two or three views with `Segmented` under the
header. The app is edge-to-edge on Android and pads by the safe-area insets. Sheets and dialogs
cap their width (560 and 380); nothing else adapts to wide screens.

RTL: rows are flex rows that the phone mirrors; shared rows use horizontal padding (the browser
preview does not flip start/end padding); arrows, chevrons and send mirror through `Icon`.

## Elevation & Depth

Hybrid, and soft. The ground is the mesh; a surface is lifted from it by translucency (white
86%), a bright edge and a two-layer shadow tinted with the theme's colour, never grey. Real
backdrop blur exists on web only. Inside a card nothing is elevated: separation is a hairline in
`line-strong` or a `wash` fill.

### Shadow Vocabulary
- **Card** (`0 1px 2px primary@5%, 0 6px 18px primary@8%`): every card, row, tile, chip-free
  surface, the tab bar, the header "+", the selected part of a switch.
- **Raised** (`0 2px 6px primary@8%, 0 14px 34px rgba(24,22,32,0.12)`): sheets, dialogs, the toast.
- **Button** (`0 4px 12px primary@20%`): the filled and WhatsApp buttons, the centre chat button.
- **Focus** (`0 0 0 3px primary@16%`): the ring around the text box being typed in.

### Named Rules
**The Tinted Shadow Rule.** Depth carries a little of the theme; a neutral grey shadow is not
part of this system.

**The Edge-On-Colour Rule.** The bright edge only shows on the mesh. On white, a line is
`line-strong` and a quiet fill is `wash`.

## Shapes

Everything is round and nothing is sharp. Cards, rows, tiles and grouped cards are 22. Sheets
(top corners), dialogs and the tab bar's top corners are 28. Text fields and notes are 14.
Buttons, chips, badges, the switch and its parts are full pills. Icon squares are rounded
squares at about a third of their size (44 → 14, 36 → 12, 28 → 9). People are circles with an
initial. The centre chat button is a 62 circle with a 3 px white ring. `radius.sm` (12) exists
in the scale and is not used by name. Borders are 1 px bright edges on surfaces and hairlines
inside cards; a selected plan card on the paywall uses a 2 px theme border.

## Components

### Buttons
- **Shape:** pill. Heights 40 (sm), 48 (md, default), 56 (lg). Horizontal padding 20 (12 for sm).
  An optional 20 px Ionicon before the label, 8 apart.
- **Filled:** theme accent fill, white label, the Button shadow, and a faint white gloss (4%)
  over the top half. For the screen's one main action.
- **Tonal:** theme soft at 80% with a bright edge, label in theme ink. The button on a card in a
  list.
- **Outline:** white surface with a bright edge, label in theme ink. **Text:** no fill.
  **Danger:** no fill, red label. **WhatsApp:** filled green with the same gloss and shadow.
- **States:** pressed swaps the fill for a deeper one; disabled or busy is 45% opacity; busy
  shows a spinner in place of the label. No ripple.
- **IconButton:** a round 44 icon-only button with a 6 hit slop.

### Chips
- **Style:** 40 tall pill, white surface, `line-strong` border, label in ink (small strong),
  optional 16 px icon in the tone's colour.
- **State:** selected fills with the tone's ink colour (theme ink by default; `family` teal or
  `calm` violet by tone) and turns the label white. Chips are for answers to pick.

### Cards / Containers
- **Corner Style:** 22.
- **Background:** white 86% with the bright 1 px edge; `tone` tints a card with a colour at 90%.
- **Shadow Strategy:** Card shadow.
- **Internal Padding:** 16, with an 8 gap.
- **Variants:** `ListRow` (a card that is one row, 64 tall, leading visual, title in body strong,
  meta in small, chevron); `Tile` (104 tall: 28 icon square and a small strong title, a value in
  title size in theme ink, one caption line that may take an ok / warn / danger tone);
  `RowGroup` + `NavRow` (settings rows in one card with hairlines, 56 tall, 36 icon square,
  title at weight 500, value line in small, chevron; a danger row is red with no chevron).
- **Pressed:** 80% opacity and a 0.99 scale; rows inside a group take a `wash` fill instead.

### Inputs / Fields
- **Style:** `TextField`: optional small strong label in ink soft above; a 52 tall box, white
  96%, radius 14, bright edge, 17 px text; `big` is 64 tall with 26 px bold text (amounts).
- **Focus:** border in the theme accent, solid white fill, the Focus ring.
- **Error / Disabled:** no dedicated style exists; errors are reported by toast (`notify`).

### Navigation
- **Tab bar:** a glass surface with 28 top corners, 62 tall plus the bottom inset; outline
  Ionicons that fill when active; 12 px semibold labels; a theme-coloured badge on Today.
- **Centre chat button:** 62 circle in the theme accent, raised 26 above the bar, white ring,
  an 18% gloss, a 30 px chat-bubble icon, its label under it.
- **Headers:** the mesh under a 45% white veil with a hairline edge (`GlassHeader`). Tab titles
  26 bold at the start; pushed titles 18 semibold beside a back arrow.
- **Header "+":** a 44 white circle with the Card shadow and a 26 px "+" in theme ink; with one
  action it runs it, with more it opens the add sheet.
- **Segmented:** a 44 tall pill track in `wash` with 3 padding; the selected part is solid white
  with the Card shadow; two or three one-word parts of equal width. For views, not answers.

### Add sheet, dialogs, toast
- **Add sheet:** a plain `Modal` over a 40% scrim; solid white, 28 top corners, a 36 × 4 grip, a
  headline title, rows 56 tall with a 36 kind-coloured icon square and a hairline between rows.
  It fades in and rises 28 px over 220 ms.
- **Dialog (`confirm` / `ask`):** white 96%, radius 28, text actions in a row (red for the
  destructive one). On native the default `Alert` is still reachable through the same module.
- **Toast (`notify`):** a dark warm slab (`rgba(47,38,33,0.92)`), radius 22, white small strong
  text, 84 above the bottom inset.

### Zaki (signature)
- **`ZakiAvatar`:** the spark-smile tile as an image, in the user's theme, two moods (happy: open
  eye; calm: closed curve). Rendered from one SVG (assets/logo/zaki-mark.svg) at 320 px, crisp
  to about 100 pt. Used at 20 to 36 beside chat lines and in the chat header, 56 to 72 on empty
  states, intro panels and heroes, 104 once. `glow` puts a theme-coloured shadow behind it.
- **`IntroPanel` / `EmptyState`:** Zaki (calm), one headline sentence, at most one filled button.

### Motion
- **`Appear`:** fade in and lift 10 px over 220 ms, ease-out cubic, once. With the phone's
  "reduce motion" setting it only fades.
- **`LoadingCards`:** cards in the page's shape whose blocks breathe between 50% and 100% opacity
  every 1.4 s; still under reduce motion.
- Only opacity and position move (native driver). No animation library.

## Do's and Don'ts

### Do:
- **Do** put every colour through `palette` / `kind` and every text through `Text` with a role;
  the app outside src/ui has 11 raw hex values (9 of them in Session) and 13 font-size overrides.
- **Do** keep one filled button a screen; a card that comes in a list uses tonal or outline.
- **Do** use `line-strong` for a line and `wash` for a quiet fill inside a white card.
- **Do** use `Segmented` to switch views and `Chip` for an answer to pick.
- **Do** give every touchable a 48 target (height or height plus hit slop).
- **Do** colour an icon's square by kind and keep one Ionicon per meaning across the app.
- **Do** write numbers in Latin digits and let rows mirror in Arabic; mirror arrows through `Icon`.
- **Do** keep motion to opacity and position with core `Animated`, and honour reduce motion.

### Don't:
- **Don't** use `primary` for small text; use `primary-ink`.
- **Don't** add a second type family, a gradient, blur or SVG native module (owner decisions:
  one family, updates must ship over the air).
- **Don't** put emoji on buttons, chips or titles (`plain()` strips them).
- **Don't** add helper sentences under a title, row, button or field (the "far fewer words" rule).
- **Don't** use a grey shadow, or the bright edge as a line on white.
- **Don't** change kind, family, friends or Session colours with the theme.
- **Don't** call Session therapy or give it the app's playful ground: it keeps its calm mesh.
