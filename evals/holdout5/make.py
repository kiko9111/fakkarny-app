# Fifth held-out set for Zaki's rule engine (QA thread "Test every Zaki action end to end",
# 2026-11-25). Written after the engine reached 100% on holdout4, and BEFORE running the engine on
# it, with a different household (other names, sections and trackers) to test generalisation. Wording comes from how kareem and Egyptian moms actually type: Franco with digits,
# no spaces, English mixed in, voice-typing run-ons, Arabic spelling slips (ة/ه, ى/ي, أ/ا), and
# kareem's real chat lines from 2026-11-25 screenshots ("la2 mafeesh", "fee eh kol dah", ...).
# NOW is Thu 2026-11-19 10:00 Cairo: Fri 20, Sat 21, Sun 22, Mon 23, Tue 24, Wed 25, Thu 26.
# Regenerate: python3 evals/holdout5/make.py
import json, os
APP = {"circles": [{"name": "العيلة", "kind": "family", "members": ["ماما", "أحمد", "سلمى"]},
                   {"name": "صحاب الكلية", "kind": "friends", "members": ["Youssef", "Mariam"]}],
       "sections": [{"name": "سوبرماركت", "kind": "expense", "budget": 4000}, {"name": "بنزين", "kind": "expense"},
                    {"name": "فواتير", "kind": "expense"}, {"name": "مدارس", "kind": "expense"},
                    {"name": "شغل حر", "kind": "income"}],
       "trackers": [{"kind": "water", "goal": 8}, {"kind": "custom", "name": "المشي", "goal": 30},
                    {"kind": "custom", "name": "الصلاة", "goal": 5}]}
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
    x = {"id": f"h5-{area}-{cid}", "area": area, "app": APP, "message": msg, "expect": e}
    if open_items: x["open_items"] = list(open_items)
    if history: x["history"] = [{"role": r, "text": t} for r, t in history]
    cases.append(x)
R = lambda title, due=None, **k: {"type": "reminder", **({"title_any": title} if title else {}), **({"due": due} if due else {}), **k}
T = lambda title, date=None, **k: {"type_any": ["reminder", "task"], "title_any": title, **({"due_date": date} if date else {}), **k}
D = lambda person, amount, direction, **k: {"type": "debt", "debt": {"person_any": person, "amount": amount, "direction": direction}, **k}
OI = lambda n, t, due=None, **k: {"id": ID(n), "type": k.pop("type", "reminder"), "title": t, **({"due_local": due} if due else {}), **k}
A = lambda kind, **k: {"kind": kind, **k}


# ================= reminders: new =================
c("reminder", "fr-rob3-sa3a", "fakkarny ba3d rob3 sa3a at2aked men el forn", "franco", [R(["فرن", "forn"], "2026-11-19T10:15")])
c("reminder", "fr-bokra-10-sob7", "bokra el sa3a 10 el sob7 fakarny akalem el bank", "franco", [R(["bank", "البنك", "بنك"], "2026-11-20T10:00")])
c("reminder", "fr-tuesday", "fakarny yom el talat el sa3a 4 a5od salma mel nady", "franco", [R(["سلمى", "salma", "nady", "النادي"], "2026-11-24T16:00")])
c("reminder", "fr-daily-night", "fakarny kol yom el sa3a 9 bel leil a5od el vitamin", "franco", [R(["vitamin", "فيتامين"], "2026-11-19T21:00", repeat=1440)])
c("reminder", "fr-3al-7", "fakkarny 3al 7 ashoof el match", "franco", [R(["match", "ماتش"], "2026-11-19T19:00")])
c("reminder", "fr-b3d-2-sa3at", "fkrny b3d 2 sa3at ashel el ghasil", "franco", [R(["غسيل", "ghasil"], "2026-11-19T12:00")])
c("reminder", "ar-afternoon", "فكرني بكره بعد الضهر اروح البنك", "arabic", [T(["البنك", "بنك"], "2026-11-20")])
c("reminder", "ar-sunday-11", "ذكرني يوم الاحد الساعه ١١ الصبح بميعاد الكهربائي", "arabic", [R(["الكهربائي", "كهربائي"], "2026-11-22T11:00")])
c("reminder", "ar-hour-half", "فكرني كمان ساعة ونص اقلب الاكل", "arabic", [R(["الاكل", "الأكل"], "2026-11-19T11:30")])
c("reminder", "ar-maghrib", "عندي ميعاد مع الدكتورة يوم الاتنين الساعة ٦ المغرب", "arabic", [R(["الدكتورة", "دكتورة", "الدكتوره"], "2026-11-23T18:00")])
c("reminder", "ar-daily-morning", "فكريني كل يوم الساعة ٨ الصبح اديله الدوا", "arabic", [R(["الدوا", "دوا"], "2026-11-20T08:00", repeat=1440)])
c("reminder", "ar-first-of-month", "فكرني ادفع الايجار يوم ١ الشهر الجاي", "arabic", [T(["الايجار", "الإيجار"], "2026-12-01")])
c("reminder", "ar-tonight", "فكرني بالليل اكلم بابا", "arabic", [T(["بابا"], "2026-11-19")])
c("reminder", "en-45-min", "remind me in 45 minutes to check the cake", "english", [R(["cake"], "2026-11-19T10:45")])
c("reminder", "en-friday-morning", "remind me friday morning to pay the electricity bill", "english", [T(["electricity"], "2026-11-20")])
c("reminder", "en-tmrw-5pm", "pls remind me tmrw 5pm pick up salma from school", "english", [R(["salma", "سلمى", "school"], "2026-11-20T17:00")])
c("reminder", "en-daily-7am", "remind me every day at 7am to take my vitamins", "english", [R(["vitamins"], "2026-11-20T07:00", repeat=1440)])
c("reminder", "en-monday-11", "Monday 11am meeting with the accountant", "english", [R(["accountant"], "2026-11-23T11:00")])
c("reminder", "en-wake-545", "wake me up at 5:45 tomorrow", "english", [R([], "2026-11-20T05:45", alarm=True)])
c("reminder", "ar-alarm-fagr", "اعملي منبه الساعة ٥ الفجر", "arabic", [R([], "2026-11-20T05:00", alarm=True)])
c("reminder", "fr-alarm-rob3", "e3mly monabeh 6 w rob3 bokra", "franco", [R([], "2026-11-20T06:15", alarm=True)])
c("reminder", "ar-two-times", "فكرني الساعة ٣ اخد سلمى من المدرسة و الساعة ٦ درس البيانو", "arabic", [R(["سلمى", "المدرسة"], "2026-11-19T15:00"), R(["البيانو"], "2026-11-19T18:00")])
c("reminder", "en-two-times", "remind me at 4 to call mom and at 9 to lock the door", "english", [R(["mom"], "2026-11-19T16:00"), R(["door"], "2026-11-19T21:00")])
c("reminder", "ar-voice-words", "يا زكي معلش فكرني بكرة الساعة اتناشر الضهر عشان عندي مكالمة مهمة مع الشغل", "arabic", [R(["مكالمة", "مكالمه"], "2026-11-20T12:00")])
c("reminder", "fr-en-mix-3asr", "remind me ba3d bokra 3 el 3asr a7gez el tazaker", "franco", [R(["tazaker", "تذاكر", "التذاكر"], "2026-11-21T15:00")])

# ================= reminders: answers / edits / done =================
c("reminder-edit", "fr-done-ghasil", "5alast el ghasil", "franco", updates=[{"id": ID(1), "status": "done"}], open_items=[OI(1, "أنشر الغسيل", "2026-11-19T09:00")])
c("reminder-edit", "ar-done-bank", "خلصت مكالمة البنك", "arabic", updates=[{"id": ID(2), "status": "done"}], open_items=[OI(2, "أكلم البنك", "2026-11-19T09:30")])
c("reminder-edit", "en-done-already", "already did the groceries", "english", updates=[{"id": ID(3), "status": "done"}], open_items=[OI(3, "Order groceries", "2026-11-19T09:00")])
c("reminder-edit", "fr-a5aro-2h", "a5aro sa3teen", "franco", updates=[{"id": ID(4), "due": "2026-11-19T12:00"}], open_items=[OI(4, "أقلب الأكل", "2026-11-19T10:00")], history=[("assistant", "وقت تقلب الأكل 🍲")])
c("reminder-edit", "ar-pronoun-9", "خليها الساعة ٩ بالليل", "arabic", updates=[{"id": ID(5), "due": "2026-11-19T21:00"}], open_items=[OI(5, "أكلم بابا", "2026-11-19T19:00")], history=[("assistant", "هفكرك الساعة ٧ تكلم بابا")])
c("reminder-edit", "en-move-day", "move the accountant meeting to tuesday", "english", updates=[{"id": ID(6), "due": "2026-11-24T11:00"}], open_items=[OI(6, "Meeting with the accountant", "2026-11-23T11:00")])
c("reminder-edit", "en-push-3pm", "push it to 3pm", "english", updates=[{"id": ID(7), "due": "2026-11-19T15:00"}], open_items=[OI(7, "Call mom", "2026-11-19T13:00")], history=[("assistant", "Reminder set: «Call mom» at 1pm")])
c("reminder-edit", "ar-stop-vitamin", "مش عايزك تفكرني بالفيتامين تاني", "arabic", updates=[{"id": ID(8), "status": "cancelled"}], open_items=[OI(8, "آخد الفيتامين", "2026-11-19T21:00", repeat=1440)])
c("reminder-edit", "fr-batal-maya", "batal tfakarny bel maya", "franco", updates=[{"id": ID(9), "status": "cancelled"}], open_items=[OI(9, "أشرب مية", "2026-11-19T11:00", repeat=120)])
c("reminder-edit", "ar-cancel-asks", "الغي ميعاد الكهربائي", "arabic", updates=[], ask="confirm", open_items=[OI(10, "ميعاد الكهربائي", "2026-11-22T11:00")])
c("reminder-edit", "en-cancel-yes", "yes cancel it", "english", updates=[{"id": ID(11), "status": "cancelled"}], open_items=[OI(11, "Electrician", "2026-11-22T11:00")], history=[("user", "cancel the electrician"), ("assistant", "Cancel «Electrician»?")])
c("reminder-edit", "ar-cancel-no", "لا خليه", "arabic", updates=[], open_items=[OI(12, "ميعاد الكهربائي", "2026-11-22T11:00")], history=[("user", "الغي ميعاد الكهربائي"), ("assistant", "ألغي «ميعاد الكهربائي»؟")])

# ================= asks and answers =================
c("ask", "ar-gift-no-time", "فكرني اجيب هدية لماما", "arabic", ask="time")
c("ask", "en-flight-no-time", "remind me to book the flight", "english", ask="time")
c("ask", "fr-alarm-no-time", "e3mel monabeh", "franco", ask="time")
c("ask", "fr-debt-no-amount", "youssef 3aleh felous", "franco", ask="amount")
c("ask", "en-unknown-person", "tell Ali to bring the chairs", "english", ask="person")
c("ask", "fr-answer-bokra-11", "bokra 11", "franco", [R(["هدية", "hedeya", "ماما", "mama"], "2026-11-20T11:00")], history=[("user", "fakarny ageeb hedeya l mama"), ("assistant", "أفكرك إمتى؟")])
c("ask", "en-answer-500", "500", "english", [D(["youssef", "يوسف"], 500, "owed_to_me")], history=[("user", "Youssef owes me money"), ("assistant", "How much does Youssef owe you?")])

# ================= Daftar =================
c("daftar", "fr-ahmed-3aleh", "ahmed 3aleh 750", "franco", [D(["ahmed", "أحمد", "احمد"], 750, "owed_to_me")])
c("daftar", "fr-3alaya", "ana 3alaya 400 l mariam", "franco", [D(["mariam", "مريم"], 400, "i_owe")])
c("daftar", "ar-mestalfa", "مريم مستلفة مني ١٠٠٠", "arabic", [D(["مريم", "mariam"], 1000, "owed_to_me")])
c("daftar", "ar-madyoon", "انا مديون ليوسف ب ٦٠٠", "arabic", [D(["يوسف", "youssef"], 600, "i_owe")])
c("daftar", "en-borrowed-from-me", "Youssef borrowed 1200 from me", "english", [D(["youssef"], 1200, "owed_to_me")])
c("daftar", "en-i-borrowed", "I borrowed 300 from Mariam", "english", [D(["mariam"], 300, "i_owe")])
c("daftar", "ar-arabic-comma", "سلمى عليها ١،٥٠٠", "arabic", [D(["سلمى"], 1500, "owed_to_me")])
c("daftar", "fr-rag3li", "ahmed rag3li el 750", "franco", updates=[{"id": ID(20), "status": "done"}], open_items=[OI(20, "أحمد عليه ٧٥٠", type="debt", debt_person="أحمد", debt_amount=750, debt_direction="owed_to_me")])
c("daftar", "en-paid-back", "I paid Mariam back", "english", updates=[{"id": ID(21), "status": "done"}], open_items=[OI(21, "I owe Mariam 400", type="debt", debt_person="Mariam", debt_amount=400, debt_direction="i_owe")])
c("daftar", "ar-sadad", "يوسف سدد اللي عليه", "arabic", updates=[{"id": ID(22), "status": "done"}], open_items=[OI(22, "يوسف عليه ١٢٠٠", type="debt", debt_person="يوسف", debt_amount=1200, debt_direction="owed_to_me")])
c("daftar", "en-remove-debt", "remove the debt with Tarek", "english", actions=[A("daftar_cancel", person_any=["tarek", "طارق"])])
c("daftar", "ar-no-after", "لا مفيش", "arabic", updates=[], history=[("assistant", "لو فيه دين تاني عايز تشيله قولي عليه.")])

# ================= money =================
c("money", "fr-benzeen", "dafa3t 300 benzeen", "franco", actions=[A("log_money", amount=300, money_kind="expense", section_any=["بنزين"])])
c("money", "ar-bill", "دفعت فاتورة الكهربا ٦٥٠", "arabic", actions=[A("log_money", amount=650, money_kind="expense", section_any=["فواتير"])])
c("money", "ar-vegetables", "اشتريت خضار ب ١٨٠", "arabic", actions=[A("log_money", amount=180, money_kind="expense", section_any=["سوبرماركت"])])
c("money", "en-school-books", "paid 2500 for school books", "english", actions=[A("log_money", amount=2500, money_kind="expense", section_any=["مدارس"])])
c("money", "en-freelance", "got paid 4000 for the freelance job", "english", actions=[A("log_money", amount=4000, money_kind="income", section_any=["شغل حر"])])
c("money", "ar-freelance", "جالي ٣ الاف من شغل الفريلانس", "arabic", actions=[A("log_money", amount=3000, money_kind="income", section_any=["شغل حر"])])
c("money", "fr-budget", "7ot budget 5000 lel supermarket", "franco", actions=[A("set_budget", amount=5000, section_any=["سوبرماركت"])])
c("money", "ar-new-section", "اعمل قسم جديد اسمه هدايا", "arabic", actions=[A("create_section", name_any=["هدايا"])])
c("money", "en-delete-last", "delete my last expense", "english", actions=[A("delete_money_entry")])
c("money", "en-comma", "spent 1,250 on the plumber", "english", actions=[A("log_money", amount=1250, money_kind="expense")])
c("money", "ar-question", "صرفت كام على البنزين الشهر ده؟", "arabic")
c("money", "en-price-chat", "gas went up to 19 a liter, crazy", "english")

# ================= circles / check-ins =================
c("circle", "ar-create-work", "اعمل جروب للشغل", "arabic", actions=[A("create_circle", name_any=["الشغل", "شغل"])])
c("circle", "en-create-called", "create a circle called book club", "english", actions=[A("create_circle", name_any=["book club", "Book club"])])
c("circle", "ar-on-way", "قول للعيلة اني في الطريق", "arabic", actions=[A("checkin", circle_any=["العيلة"], checkin_kind="on_way")])
c("circle", "fr-arrived", "2ol le sa7ab el kolleya eny wselt", "franco", actions=[A("checkin", circle_any=["صحاب الكلية"], checkin_kind="arrived")])
c("circle", "en-ask-ahmed", "ask Ahmed if he got home", "english", actions=[A("ask_checkin", person_any=["أحمد", "ahmed"])])
c("circle", "ar-invite", "ابعت دعوة لصحاب الكلية", "arabic", actions=[A("invite", circle_any=["صحاب الكلية"])])
c("circle", "en-tell-family", "tell the family dinner is at 8", "english", actions=[A("ask_circle", circle_any=["العيلة"])])

# ================= tasks / homework =================
c("task", "fr-assign-room", "2ol l salma tro2 2odetha", "franco", actions=[A("assign_task", person_any=["سلمى"], name_any=["اوضتها", "أوضتها", "2odetha"])])
c("task", "ar-assign-net", "اطلب من أحمد يدفع فاتورة النت", "arabic", actions=[A("assign_task", person_any=["أحمد"], name_any=["النت"])])
c("task", "en-assign-cake", "ask Mariam to bring the cake on Saturday", "english", actions=[A("assign_task", person_any=["mariam"], name_any=["cake"])])
c("task", "ar-accept-7ader", "حاضر", "arabic", actions=[A("task_answer", answer="yes")], history=[("assistant", "طلب من ماما في «العيلة»: تجيب طماطم. براحتك، وافق بس لو ينفع معاك 🌟")])
c("task", "en-decline", "sorry can't", "english", actions=[A("task_answer", answer="no")], history=[("assistant", "Ahmed is asking you for something in «العيلة»: Fix the tap. Up to you, say yes only if it works for you 🌟")])
c("homework", "fr-assign-science", "5aly salma t7el el homework bta3 el science", "franco", actions=[A("assign_task", person_any=["سلمى"], name_any=["science", "ساينس", "العلوم"])])
c("homework", "ar-bravo", "برافو عليه", "arabic", actions=[A("homework_review", answer="yes")], history=[("assistant", "أحمد سلّم واجب «العلوم» ✅")])

# ================= trackers =================
c("tracker", "fr-kobayten", "shrebt kobayten maya", "franco", actions=[A("log_tracker", amount=2, name_any=["water", "مية"])])
c("tracker", "ar-one-glass", "شربت كوباية مية", "arabic", actions=[A("log_tracker", name_any=["water", "مية"])])
c("tracker", "en-walked", "walked 20 minutes", "english", actions=[A("log_tracker", amount=20, name_any=["المشي", "مشي"])])
c("tracker", "ar-prayed", "صليت الضهر", "arabic", actions=[A("log_tracker", name_any=["الصلاة", "صلاة"])])
c("tracker", "en-glasses", "drank 4 glasses of water", "english", actions=[A("log_tracker", amount=4, name_any=["water", "مية"])])
c("tracker", "ar-new-weight", "عايزة اتابع الوزن", "arabic", actions=[A("create_tracker", name_any=["الوزن", "وزن"])])
c("tracker", "fr-new-reading", "3ayez atabe3 el 2raya", "franco", actions=[A("create_tracker", name_any=["قراية", "القراية", "2raya", "reading"])])
c("tracker", "en-walk-goal", "set my walking goal to 45", "english", actions=[A("update_tracker", amount=45, name_any=["المشي", "مشي"])])
c("tracker", "ar-neg", "ماشربتش مية النهارده", "arabic")

# ================= split =================
c("split", "fr-split", "2asem 600 beny w ben youssef w mariam", "franco", actions=[A("split_bill", amount=600, people_all=["Youssef", "Mariam"])])
c("split", "ar-split", "قسم الحساب ١٥٠٠ عليا وعلى احمد وسلمى", "arabic", actions=[A("split_bill", amount=1500, people_all=["أحمد", "سلمى"])])
c("split", "en-split", "split 800 between me and Ahmed", "english", actions=[A("split_bill", amount=800, people_all=["أحمد"])])

# ================= today / memory / settings / screens =================
c("today", "en-tomorrow", "anything tomorrow?", "english", open_items=[OI(40, "Meeting with the accountant", "2026-11-20T11:00")])
c("today", "ar-tomorrow", "عندي ايه بكرة", "arabic", open_items=[OI(41, "أكلم البنك", "2026-11-20T10:00")])
c("today", "en-open-money", "open my money page", "english", actions=[A("open_screen", screen="money")])
c("today", "fr-open-daftar", "efta7 el daftar", "franco", actions=[A("open_screen", screen="daftar")])
c("memory", "ar-son", "ابني اسمه أحمد وعنده ١٠ سنين", "arabic", mem=["أحمد", "احمد"])
c("memory", "en-husband", "my husband's name is Tarek", "english", mem=["Tarek", "طارق"])
c("settings", "ar-sleep", "انا بنام الساعة ١٢", "arabic", actions=[A("settings", setting="sleep_time", text_any=["00:00"])])
c("settings", "en-call-me", "call me Mona", "english", actions=[A("settings", setting="name", text_any=["Mona"])])

# ================= small talk (must not act, no memory) =================
c("chat", "fr-fein", "enta fein", "franco", no_mem=True)
c("chat", "fr-akhbar", "eh el akhbar", "franco", no_mem=True)
c("chat", "fr-zah2an", "ana zah2an", "franco", crisis=False, no_mem=True)
c("chat", "en-lol", "lol", "english", no_mem=True)
c("chat", "fr-ya3ny", "ya3ny eh", "franco", no_mem=True)
c("chat", "ar-thanks", "شكرا يا زكي انت جدع", "arabic", no_mem=True)
c("chat", "en-who-made", "who made you?", "english", no_mem=True)
c("chat", "ar-franco-q", "انت بتفهم فرانكو؟", "arabic", no_mem=True)
c("chat", "fr-past-visit", "kont 3and mama embare7", "franco", no_mem=True)
c("chat", "ar-crisis", "عايز اموت نفسي", "arabic", crisis=True)
c("chat", "en-crisis", "I don't want to be alive anymore", "english", crisis=True)
c("chat", "en-idiom", "this traffic is killing me", "english", crisis=False)

path = os.path.join(os.path.dirname(__file__), "holdout5.jsonl")
with open(path, "w") as f:
    for x in cases: f.write(json.dumps(x, ensure_ascii=False) + "\n")
print(len(cases), "cases")
