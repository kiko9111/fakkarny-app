# Fourth held-out set for Zaki's rule engine (QA thread "Test every Zaki action end to end",
# 2026-11-25). Written after the engine scored ~100% on cases + holdout 1-3, and BEFORE running the
# engine on it. Wording comes from how kareem and Egyptian moms actually type: Franco with digits,
# no spaces, English mixed in, voice-typing run-ons, Arabic spelling slips (ة/ه, ى/ي, أ/ا), and
# kareem's real chat lines from 2026-11-25 screenshots ("la2 mafeesh", "fee eh kol dah", ...).
# NOW is Thu 2026-11-19 10:00 Cairo: Fri 20, Sat 21, Sun 22, Mon 23, Tue 24, Wed 25, Thu 26.
# Regenerate: python3 evals/holdout4/make.py
import json, os
APP = {"circles": [{"name": "البيت", "kind": "family", "members": ["منى", "عمر", "ليلى"]},
                   {"name": "شلة الجيم", "kind": "friends", "members": ["Hassan", "Karim"]},
                   {"name": "الشغل", "kind": "friends", "members": ["سامي", "Nada"]}],
       "sections": [{"name": "أكل", "kind": "expense", "budget": 3000}, {"name": "العربية", "kind": "expense"},
                    {"name": "مواصلات", "kind": "expense"}, {"name": "البيت", "kind": "expense"},
                    {"name": "مرتب", "kind": "income"}],
       "trackers": [{"kind": "water", "goal": 8}, {"kind": "custom", "name": "القراية", "goal": 20},
                    {"kind": "custom", "name": "الرياضة", "goal": 1}]}
ID = lambda n: f"{n:08x}-0000-4000-8000-{n:012d}"
cases = []
def c(area, cid, msg, script, items=(), actions=None, updates=None, ask=None, mem=None, open_items=(), history=(), crisis=None, no_mem=False):
    e = {"script": script, "items": list(items)}
    if actions is not None: e["actions"] = actions
    if updates is not None: e["updates"] = updates
    if ask: e["ask"] = ask
    if mem: e["memories_any"] = mem
    if no_mem: e["no_memories"] = True
    if crisis is not None: e["crisis"] = crisis
    x = {"id": f"h4-{area}-{cid}", "area": area, "app": APP, "message": msg, "expect": e}
    if open_items: x["open_items"] = list(open_items)
    if history: x["history"] = [{"role": r, "text": t} for r, t in history]
    cases.append(x)
R = lambda title, due=None, **k: {"type": "reminder", **({"title_any": title} if title else {}), **({"due": due} if due else {}), **k}
T = lambda title, date=None, **k: {"type_any": ["reminder", "task"], "title_any": title, **({"due_date": date} if date else {}), **k}
D = lambda person, amount, direction, **k: {"type": "debt", "debt": {"person_any": person, "amount": amount, "direction": direction}, **k}
OI = lambda n, t, due=None, **k: {"id": ID(n), "type": k.pop("type", "reminder"), "title": t, **({"due_local": due} if due else {}), **k}
A = lambda kind, **k: {"kind": kind, **k}

# ================= reminders: new =================
c("reminder", "fr-no-space-time", "fakarny ba3d sa3teen a5od el dawa", "franco", [R(["دوا", "dawa"], "2026-11-19T12:00")])
c("reminder", "fr-nos", "fakkarny el sa3a 3 w nos ageeb el wlad", "franco", [R(["الولاد", "wlad", "العيال"], "2026-11-19T15:30")])
c("reminder", "fr-ela-rob3", "fkrny 5 ela rob3 akalem 5alty", "franco", [R(["خالتي", "5alty"], "2026-11-19T16:45")])
c("reminder", "fr-bokra-sob7", "bokra el sob7 el sa3a 8 3andy mo3ad doctor", "franco", [R(["دكتور", "doctor"], "2026-11-20T08:00", follow_up=True)])
c("reminder", "fr-friday-prayer", "fakarny el gom3a el sa3a 11 a3mel el 7amam", "franco", [R(["حمام", "7amam"], "2026-11-20T11:00")])
c("reminder", "fr-next-week", "el etnein el gay 3andy meeting el sa3a 2", "franco", [R(["meeting", "ميتنج", "اجتماع"], "2026-11-23T14:00")])
c("reminder", "fr-in-10", "kaman 10 da2aye2 fakarny a2fel el botagaz", "franco", [R(["بوتاجاز", "botagaz"], "2026-11-19T10:10", important=True)])
c("reminder", "fr-mixed-en", "remind me bokra 9 to send el report", "franco", [R(["report", "ريبورت", "تقرير"], "2026-11-20T09:00")])
c("reminder", "ar-ta-marbuta", "فكرنى الساعه ٧ اجيب عيش", "arabic", [R(["عيش"], "2026-11-19T19:00")])
c("reminder", "ar-western-digits", "فكرني الساعة 4 العصر اكلم المدرسة", "arabic", [R(["المدرسة", "المدرسه"], "2026-11-19T16:00")])
c("reminder", "ar-voice-runon", "بص يا زكي انا عايزك تفكرني بكرة الصبح الساعة تسعة اني ادفع فاتورة النت عشان هيقطعوه", "arabic", [R(["النت", "فاتورة"], "2026-11-20T09:00")])
c("reminder", "ar-ba3d-nos", "فكرني بعد نص ساعة اطفي الغسالة", "arabic", [R(["الغسالة", "الغساله"], "2026-11-19T10:30")])
c("reminder", "ar-thursday-next", "الخميس الجاي عيد ميلاد ليلى", "arabic", [T(["ليلى", "عيد ميلاد"], "2026-11-26")])
c("reminder", "ar-sabt-dohr", "يوم السبت الضهر عندي اجتماع اولياء الامور", "arabic", [R(["اولياء", "أولياء", "اجتماع"], "2026-11-21T12:00")])
c("reminder", "ar-every-friday", "كل جمعة الساعة ١٢ فكرني اكلم تيتة", "arabic", [R(["تيتة", "تيته"], "2026-11-20T12:00", repeat=10080)])
c("reminder", "ar-every-2h", "فكرني اشرب مية كل ساعتين", "arabic", [R(["مية", "ميه"], None, repeat=120)])
c("reminder", "en-lower-typos", "remind me 2morow at 6pm 2 call grandma", "english", [R(["grandma"], "2026-11-20T18:00")])
c("reminder", "en-tonight-830", "tonight 8:30 remind me to iron Omar's uniform", "english", [R(["uniform", "iron"], "2026-11-19T20:30")])
c("reminder", "en-noon", "at noon remind me to call the school", "english", [R(["school"], "2026-11-19T12:00")])
c("reminder", "en-weekday", "on wednesday at 5 I have parents meeting", "english", [R(["parents", "meeting"], "2026-11-25T17:00")])
c("reminder", "en-every-sunday", "every sunday at 10am remind me to order groceries", "english", [R(["groceries"], "2026-11-22T10:00", repeat=10080)])
c("reminder", "en-day-after", "day after tomorrow at 3 dentist for Laila", "english", [R(["dentist", "laila", "ليلى"], "2026-11-21T15:00", follow_up=True)])
c("reminder", "en-alarm", "set an alarm for 6:15 tomorrow", "english", [R([], "2026-11-20T06:15", alarm=True)])
c("reminder", "ar-alarm", "صحيني بكرة ٦ ونص", "arabic", [R([], "2026-11-20T06:30", alarm=True)])
c("reminder", "fr-alarm-sa7eeny", "sa7eeny bokra 7", "franco", [R([], "2026-11-20T07:00", alarm=True)])
c("reminder", "ar-pm-implicit", "فكرني ٢ اخد عمر من التمرين", "arabic", [R(["عمر", "التمرين"], "2026-11-19T14:00")])
c("reminder", "ar-two-things", "فكرني الساعة ٥ اكلم منى والساعة ٨ اجيب الدوا", "arabic", [R(["منى"], "2026-11-19T17:00"), R(["الدوا", "دوا"], "2026-11-19T20:00")])
c("reminder", "en-long-voice", "okay so tomorrow I have a really busy day but please remind me at 1 to transfer money to the landlord", "english", [R(["landlord", "transfer"], "2026-11-20T13:00")])
c("reminder", "fr-arabic-mix", "فكرني bokra 10 aklm el plumber", "franco", [R(["plumber", "سباك", "السباك"], "2026-11-20T10:00")])

# ================= reminders: answers / edits / done =================
c("reminder-edit", "fr-done-5alast", "5alast el dawa", "franco", updates=[{"id": ID(1), "status": "done"}], open_items=[OI(1, "آخد الدوا", "2026-11-19T09:00")])
c("reminder-edit", "ar-done-3amalt", "عملت الحمام خلاص", "arabic", updates=[{"id": ID(2), "status": "done"}], open_items=[OI(2, "أعمل الحمام", "2026-11-19T09:30")])
c("reminder-edit", "en-done-did", "done with the report", "english", updates=[{"id": ID(3), "status": "done"}], open_items=[OI(3, "Send the report", "2026-11-19T09:00")])
c("reminder-edit", "fr-move-bokra", "a5arha l bokra", "franco", updates=[{"id": ID(4), "due": "2026-11-20T15:00"}], open_items=[OI(4, "أكلم خالتي", "2026-11-19T15:00")], history=[("assistant", "ميعاد «أكلم خالتي» الساعة ٣")])
c("reminder-edit", "ar-move-time", "خلي ميعاد العيش الساعة ٨ بدل ٧", "arabic", updates=[{"id": ID(5), "due": "2026-11-19T20:00"}], open_items=[OI(5, "أجيب عيش", "2026-11-19T19:00")])
c("reminder-edit", "en-snooze-20", "snooze 20 min", "english", updates=[{"id": ID(6), "due": "2026-11-19T10:20"}], open_items=[OI(6, "Call the school", "2026-11-19T10:00")], history=[("assistant", "Time to call the school 📞")])
c("reminder-edit", "fr-ba3den", "ba3den, fakarny kaman sa3a", "franco", updates=[{"id": ID(7), "due": "2026-11-19T11:00"}], open_items=[OI(7, "أطفي الغسالة", "2026-11-19T10:00")], history=[("assistant", "الغسالة خلصت؟ اطفيها 🧺")])
c("reminder-edit", "ar-stop-repeat", "بطل تفكرني بالمية", "arabic", updates=[{"id": ID(8), "status": "cancelled"}], open_items=[OI(8, "أشرب مية", "2026-11-19T11:00", repeat=120)])
c("reminder-edit", "en-stop", "stop reminding me about the groceries", "english", updates=[{"id": ID(9), "status": "cancelled"}], open_items=[OI(9, "Order groceries", "2026-11-22T10:00", repeat=10080)])
c("reminder-edit", "ar-cancel-ask", "شيل ميعاد الدكتور", "arabic", updates=[], ask="confirm", open_items=[OI(10, "دكتور الأسنان", "2026-11-21T13:00")])
c("reminder-edit", "fr-cancel-confirm-yes", "aywa olghih", "franco", updates=[{"id": ID(11), "status": "cancelled"}], open_items=[OI(11, "Meeting", "2026-11-23T14:00")], history=[("user", "olghy el meeting"), ("assistant", "ألغي «Meeting» بتاع الاتنين؟")])
c("reminder-edit", "fr-cancel-confirm-no", "la2 seebo", "franco", updates=[], open_items=[OI(12, "Meeting", "2026-11-23T14:00")], history=[("user", "olghy el meeting"), ("assistant", "ألغي «Meeting» بتاع الاتنين؟")])
c("reminder-edit", "en-not-done", "not yet", "english", updates=[], open_items=[OI(13, "Call the school", "2026-11-19T09:00")], history=[("assistant", "Did you call the school?")])
c("reminder-edit", "ar-move-day-only", "غيرها ليوم الحد", "arabic", updates=[{"id": ID(14), "due": "2026-11-22T12:00"}], open_items=[OI(14, "أكلم تيتة", "2026-11-20T12:00")], history=[("assistant", "هفكرك الجمعة الساعة ١٢ تكلم تيتة")])

# ================= asks and answers =================
c("ask", "fr-no-time", "fakarny ageeb hedeya l mona", "franco", ask="time")
c("ask", "en-no-time-vague", "I need to remember to renew my passport", "english", ask="time")
c("ask", "ar-alarm-no-time", "اعملي منبه يا زكي", "arabic", ask="time")
c("ask", "ar-debt-no-amount", "سامي عليه فلوس ليا", "arabic", ask="amount")
c("ask", "en-spend-no-amount", "log my uber ride", "english", ask="amount")
c("ask", "fr-assign-unknown", "2ol l ahmed yegeeb el korsy", "franco", ask="person")
c("ask", "fr-answer-time", "el sa3a 6", "franco", [R(["هدية", "hedeya", "منى"], "2026-11-19T18:00")], history=[("user", "fakarny ageeb hedeya l mona"), ("assistant", "أفكرك إمتى؟")])
c("ask", "ar-answer-day-time", "بكرة ٥ العصر", "arabic", [R(["الباسبور", "باسبور", "الجواز"], "2026-11-20T17:00")], history=[("user", "فكرني اجدد الباسبور"), ("assistant", "أفكرك إمتى؟")])
c("ask", "en-answer-amount", "350", "english", [D(["sami", "سامي"], 350, "owed_to_me")], history=[("user", "Sami owes me money"), ("assistant", "How much does Sami owe you?")])
c("ask", "ar-answer-amount-words", "ميتين جنيه", "arabic", [D(["سامي"], 200, "owed_to_me")], history=[("user", "سامي عليه فلوس ليا"), ("assistant", "قد إيه؟")])

# ================= Daftar =================
c("daftar", "fr-3aleh", "karim 3aleh 300 men el 3asha", "franco", [D(["karim", "كريم"], 300, "owed_to_me")])
c("daftar", "fr-salaft", "salaft nada 1500", "franco", [D(["nada", "ندى"], 1500, "owed_to_me")])
c("daftar", "fr-mestalef", "ana mestalef men sami 2000", "franco", [D(["sami", "سامي"], 2000, "i_owe")])
c("daftar", "ar-lend", "سلفت منى ٥٠٠ جنيه", "arabic", [D(["منى"], 500, "owed_to_me")])
c("daftar", "ar-i-owe-ly", "ليه عندي ٣٠٠ لحسن", "arabic", [D(["حسن", "hassan"], 300, "i_owe")])
c("daftar", "en-lent", "I lent Hassan 800 yesterday", "english", [D(["hassan"], 800, "owed_to_me")])
c("daftar", "en-i-owe", "I owe Nada 250 for lunch", "english", [D(["nada"], 250, "i_owe")])
c("daftar", "ar-k", "كريم عليه ٢ك", "arabic", [D(["كريم", "karim"], 2000, "owed_to_me")])
c("daftar", "en-paid-back", "Karim gave me back the 300", "english", updates=[{"id": ID(20), "status": "done"}], open_items=[OI(20, "Karim owes 300", type="debt", debt_person="Karim", debt_amount=300, debt_direction="owed_to_me")])
c("daftar", "fr-raga3", "sami raga3ly el felous", "franco", updates=[{"id": ID(21), "status": "done"}], open_items=[OI(21, "سامي عليه ٢٠٠", type="debt", debt_person="سامي", debt_amount=200, debt_direction="owed_to_me")])
c("daftar", "ar-i-paid", "اديت حسن فلوسه", "arabic", updates=[{"id": ID(22), "status": "done"}], open_items=[OI(22, "عليا ٣٠٠ لحسن", type="debt", debt_person="حسن", debt_amount=300, debt_direction="i_owe")])
# Corrected after the first run: removing a Daftar entry is a daftar_cancel card (the server says if
# there is none), not the confirm question used for reminders.
c("daftar", "fr-cancel-no-debt", "olghy dein abdelkareem", "franco", actions=[A("daftar_cancel", person_any=["abdelkareem", "عبد الكريم", "عبدالكريم"])])
c("daftar", "fr-loop-la2", "la2", "franco", updates=[], history=[("user", "olghy dein abdelkareem"), ("assistant", "مفيش دين باسم عبد الكريم في الدفتر. تقصد مين؟")])
c("daftar", "fr-loop-2e2flo", "2e2flo", "franco", updates=[], history=[("user", "la2"), ("assistant", "تمام، مش هلغي حاجة.")])
c("daftar", "fr-loop-mafeesh", "la2 mafeesh", "franco", updates=[], history=[("assistant", "لو فيه دين تاني عايز تشيله قولي عليه.")])

# ================= money =================
c("money", "fr-sarft", "sraft 400 3la el 3arabeya benzeen", "franco", actions=[A("log_money", amount=400, money_kind="expense", section_any=["العربية"])])
c("money", "ar-groceries", "جبت طلبات البيت ب ٨٥٠", "arabic", actions=[A("log_money", amount=850, money_kind="expense", section_any=["البيت", "أكل"])])
c("money", "ar-taxi", "ركبت تاكسي ب ٦٠", "arabic", actions=[A("log_money", amount=60, money_kind="expense", section_any=["مواصلات"])])
c("money", "en-dinner", "spent 320 on dinner out", "english", actions=[A("log_money", amount=320, money_kind="expense", section_any=["أكل"])])
c("money", "en-salary", "salary came in 12000", "english", actions=[A("log_money", amount=12000, money_kind="income", section_any=["مرتب"])])
c("money", "ar-salary", "قبضت المرتب ١٥ الف", "arabic", actions=[A("log_money", amount=15000, money_kind="income", section_any=["مرتب"])])
c("money", "fr-budget", "7ot budget lel akl 2500", "franco", actions=[A("set_budget", amount=2500, section_any=["أكل"])])
c("money", "en-new-section", "make a new section for the kids", "english", actions=[A("create_section", name_any=["kids", "ولاد", "عيال"])])
c("money", "ar-delete-last", "امسح آخر مصروف", "arabic", actions=[A("delete_money_entry")])
c("money", "fr-decimals", "dafa3t 45.5 coffee", "franco", actions=[A("log_money", amount=45.5, money_kind="expense", section_any=["أكل"])])
c("money", "ar-comma-thousands", "دفعت ١٬٢٠٠ للسباك", "arabic", actions=[A("log_money", amount=1200, money_kind="expense")])
c("money", "en-not-spend-question", "how much did I spend on food this month?", "english")
c("money", "ar-price-chat", "اللحمة بقت ب ٤٥٠ الكيلو", "arabic")

# ================= circles / check-ins =================
c("circle", "fr-create", "e3mel group lel 3eila", "franco", actions=[A("create_circle", name_any=["عيلة", "عيله", "3eila"])])
# Corrected after the first run: cases/understanding.jsonl (act-checkin-home) already decided this exact
# sentence means "home" for a family circle called البيت.
c("circle", "ar-home-checkin", "قول للبيت اني وصلت", "arabic", actions=[A("checkin", circle_any=["البيت"], checkin_kind="home")])
c("circle", "en-onway", "tell the family I'm on my way", "english", actions=[A("checkin", circle_any=["البيت"], checkin_kind="on_way")])
c("circle", "ar-ask-omar", "اسأل عمر وصل ولا لا", "arabic", actions=[A("ask_checkin", person_any=["عمر"])])
c("circle", "en-invite", "send an invite for the work group", "english", actions=[A("invite", circle_any=["الشغل"])])
c("circle", "ar-rename", "غير اسم شلة الجيم لـ الأبطال", "arabic", actions=[A("rename_circle", circle_any=["الجيم"], name_any=["الأبطال", "الابطال"])])
c("circle", "fr-ask-circle", "2ol lel beit en el ghada el sa3a 3", "franco", actions=[A("ask_circle", circle_any=["البيت"])])

# ================= tasks / homework =================
c("task", "fr-assign", "2ol l omar yzaker el math", "franco", actions=[A("assign_task", person_any=["عمر"], name_any=["math", "ماث", "رياضيات"])])
c("task", "ar-assign-when", "قول لمنى تجيب العيش بكرة الصبح", "arabic", actions=[A("assign_task", person_any=["منى"], name_any=["العيش", "عيش"])])
c("task", "en-assign", "ask Nada to send the slides by tomorrow", "english", actions=[A("assign_task", person_any=["nada"], name_any=["slides"])])
c("task", "ar-accept", "ماشي هعملها", "arabic", actions=[A("task_answer", answer="yes")], history=[("assistant", "منى طلبت منك: «تغسل العربية» (البيت)")])
c("task", "en-decline", "no I can't today", "english", actions=[A("task_answer", answer="no")], history=[("assistant", "Mona asked you: «Wash the car» (البيت)")])
c("homework", "fr-assign", "5aly laila t7el wageb el 3araby", "franco", actions=[A("assign_task", person_any=["ليلى"], name_any=["عربي", "العربي", "3araby"])])
c("homework", "ar-redo", "لا خليه يعيده تاني", "arabic", actions=[A("homework_review", answer="no")], history=[("assistant", "عمر سلّم واجب «الماث» ✅")])

# ================= trackers =================
c("tracker", "fr-water", "shrebt 3 kobayat maya", "franco", actions=[A("log_tracker", amount=3, name_any=["water", "مية"])])
c("tracker", "ar-water-number", "شربت ٢ مية", "arabic", actions=[A("log_tracker", amount=2, name_any=["water", "مية"])])
c("tracker", "en-workout", "did my workout today", "english", actions=[A("log_tracker", name_any=["رياضة", "رياضه"])])
c("tracker", "ar-reading", "قريت ١٥ صفحة", "arabic", actions=[A("log_tracker", amount=15, name_any=["قراية"])])
# Corrected after the first run: "sleep" is not a tracker kind in packages/shared/src/trackers.ts, so a custom "النوم" is right.
c("tracker", "ar-new-sleep", "عايز اتابع النوم", "arabic", actions=[A("create_tracker", tracker_kind="custom", name_any=["النوم"])])
c("tracker", "en-new-custom", "track my walks for me", "english", actions=[A("create_tracker", name_any=["walk"])])
c("tracker", "en-goal", "change my water goal to 10", "english", actions=[A("update_tracker", amount=10, name_any=["water", "مية"])])
c("tracker", "ar-plan-not-log", "ناوي اشرب مية كتير النهارده", "arabic")
c("tracker", "ar-neg-not-log", "مشربتش مية خالص النهارده", "arabic")

# ================= split =================
c("split", "fr-split", "2assem el 7esab 1200 beny w ben karim w hassan", "franco", actions=[A("split_bill", amount=1200, people_all=["Karim", "Hassan"])])
c("split", "ar-split", "قسم ٩٠٠ عليا وعلى منى وعمر", "arabic", actions=[A("split_bill", amount=900, people_all=["منى", "عمر"])])
c("split", "en-split", "we were 3, me Nada and Sami, bill was 1350 split it", "english", actions=[A("split_bill", amount=1350, people_all=["Nada", "سامي"])])

# ================= today / memory / settings / screens =================
c("today", "fr-week", "3andy eh el esbo3 da", "franco", open_items=[OI(40, "Meeting", "2026-11-23T14:00")])
c("today", "en-today", "what's on today?", "english", open_items=[OI(41, "Call the school", "2026-11-19T12:00")])
c("today", "ar-open-daftar", "افتحلي الدفتر", "arabic", actions=[A("open_screen", screen="daftar")])
c("memory", "fr-wife", "mrati esmaha mona w 3eed melad-ha 12 march", "franco", mem=["منى", "mona"])
c("memory", "ar-like", "انا مش بحب القهوة بالسكر", "arabic", mem=["قهوة", "القهوة"])
c("memory", "en-forget", "forget what I told you about my job", "english", actions=[A("forget")])
c("settings", "ar-wake", "انا بصحى الساعة ٦", "arabic", actions=[A("settings", setting="wake_time", text_any=["06:00"])])
c("settings", "en-name", "call me Kiko", "english", actions=[A("settings", setting="name", text_any=["Kiko"])])

# ================= kareem's real small talk (must not act, no memory) =================
c("chat", "fr-fee-eh", "fee eh kol dah", "franco", no_mem=True)
c("chat", "fr-msh-btrod", "msh btrod lee", "franco", no_mem=True)
c("chat", "fr-mabtrodesh", "howa enta mabtrodesh lee ya zaki", "franco", no_mem=True)
c("chat", "fr-alo", "alo", "franco", no_mem=True)
c("chat", "fr-t3ban", "law t3ban 2oly", "franco", no_mem=True)
c("chat", "fr-faster", "hawel tb2a asra3 shwaya please", "franco", no_mem=True)
c("chat", "fr-odamak", "tyb enta odamak ad eh w trod", "franco", no_mem=True)
c("chat", "fr-zaki", "zaki", "franco", no_mem=True)
c("chat", "ar-hi", "ازيك يا زكي عامل ايه", "arabic", no_mem=True)
c("chat", "en-joke", "tell me a joke", "english", no_mem=True)
c("chat", "ar-question-time", "الساعة كام دلوقتي؟", "arabic", no_mem=True)
c("chat", "fr-past-event", "embare7 kont fe fara7 sa7by w kan gamed", "franco", no_mem=True)
c("chat", "en-what-can", "what can you do?", "english", no_mem=True)
c("chat", "ar-sad-not-crisis", "انا زهقان شوية", "arabic", crisis=False)
c("chat", "fr-crisis", "msh 3ayez a3eesh tany", "franco", crisis=True)
c("chat", "en-crisis", "i want to kill myself", "english", crisis=True)
c("chat", "ar-idiom-not-crisis", "هموت من الضحك", "arabic", crisis=False)

path = os.path.join(os.path.dirname(__file__), "holdout4.jsonl")
with open(path, "w") as f:
    for x in cases: f.write(json.dumps(x, ensure_ascii=False) + "\n")
print(len(cases), "cases")
