# Held-out test set for Zaki's rule engine (2026-11-25), written BEFORE the engine, per area.
# NOW is Thu 2026-11-19 10:00 Cairo: Fri 20, Sat 21, Sun 22, Mon 23, Tue 24, Wed 25, Thu 26.
# Regenerate holdout.jsonl with: python3 evals/holdout/make.py
import json, os
APP = {"circles": [{"name": "البيت", "kind": "family", "members": ["منى", "عمر", "ليلى"]},
                   {"name": "شلة الجيم", "kind": "friends", "members": ["Hassan", "Karim"]}],
       "sections": [{"name": "أكل", "kind": "expense", "budget": 3000}, {"name": "العربية", "kind": "expense"},
                    {"name": "مواصلات", "kind": "expense"}, {"name": "مرتب", "kind": "income"}],
       "trackers": [{"kind": "water", "goal": 8}, {"kind": "custom", "name": "القراية", "goal": 20}, {"kind": "steps", "goal": 8000}]}
ID = lambda n: f"{n:08x}-0000-4000-8000-000000000000"[:8] + "-0000-4000-8000-" + f"{n:012d}"
cases = []
def c(area, cid, msg, script, items=(), actions=None, updates=None, ask=None, mem=None, open_items=(), history=(), now=None, crisis=None):
    e = {"script": script, "items": list(items)}
    if actions is not None: e["actions"] = actions
    if updates is not None: e["updates"] = updates
    if ask: e["ask"] = ask
    if mem: e["memories_any"] = mem
    if crisis is not None: e["crisis"] = crisis
    x = {"id": f"ho-{area}-{cid}", "area": area, "app": APP, "message": msg, "expect": e}
    if open_items: x["open_items"] = list(open_items)
    if history: x["history"] = [{"role": r, "text": t} for r, t in history]
    if now: x["now"] = now
    cases.append(x)
R = lambda title, due=None, **k: {"type": "reminder", "title_any": title, **({"due": due} if due else {}), **k}
T = lambda title, date=None, **k: {"type_any": ["reminder", "task"], "title_any": title, **({"due_date": date} if date else {}), **k}
D = lambda person, amount, direction, **k: {"type": "debt", "debt": {"person_any": person, "amount": amount, "direction": direction}, **k}

# ---------- reminders: create ----------
c("reminder", "noon", "remind me to call the bank at noon", "english", [R(["bank"], "2026-11-19T12:00")])
c("reminder", "545", "remind me at 5:45pm to leave for the airport", "english", [R(["airport", "leave"], "2026-11-19T17:45")])
c("reminder", "after-tomorrow-ar", "بعد بكرة عندي فرح الساعة ٨ بالليل", "arabic", [R(["فرح"], "2026-11-21T20:00")])
c("reminder", "after-tomorrow-fr", "ba3d bokra 3andy dars el sa3a 4", "franco", [R(["درس", "dars"], "2026-11-21T16:00")])
c("reminder", "in-30", "فكرني كمان نص ساعة أطفي الغسالة", "arabic", [R(["غسال"], "2026-11-19T10:30")])
c("reminder", "in-3h-en", "in 3 hours remind me to pick up the laundry", "english", [R(["laundry"], "2026-11-19T13:00")])
c("reminder", "asr", "هعدي على جدتي النهارده العصر", "arabic", [T(["جدت", "جدتي"], "2026-11-19")])
c("reminder", "next-mon-fr", "fakarny yom el etnein el gay el sa3a 10 el sob7 a7gez el kashf", "franco", [R(["كشف", "kashf"], "2026-11-23T10:00")])
c("reminder", "day-3", "لازم أجدد الاشتراك يوم ٣", "arabic", [T(["اشتراك"], "2026-12-03")])
c("reminder", "tonight-en", "dinner with Laila tonight at 9", "english", [R(["laila", "dinner"], "2026-11-19T21:00")])
c("reminder", "wed-fr", "el arba3 el sa3a 6 3andy training", "franco", [R(["training", "تمرين", "ترينينج"], "2026-11-25T18:00")])
c("reminder", "pills-every-8h", "remind me every 8 hours to take my antibiotic", "english", [R(["antibiotic"], "2026-11-19T18:00", repeat=480, important=True)])
c("reminder", "weekly-fri", "كل جمعة الساعة ١١ فكرني أكلم خالتي", "arabic", [R(["خالت"], "2026-11-20T11:00", repeat=10080)])
c("reminder", "alarm-fr", "sa7eeny bokra el sa3a 5 w nos", "franco", [R([], "2026-11-20T05:30", alarm=True)])
c("reminder", "doctor-fu", "I have a dermatologist appointment Monday at 4", "english", [R(["dermatolog"], "2026-11-23T16:00", follow_up=True)])
c("reminder", "interview-fu", "عندي انترفيو يوم الحد الساعة ١٢ الضهر", "arabic", [R(["انترفيو"], "2026-11-22T12:00", follow_up=True, important=True)])
# ---------- reminders: edit / done / delete ----------
OI = lambda n, t, due=None, **k: {"id": ID(n), "type": k.pop("type", "reminder"), "title": t, **({"due_local": due} if due else {}), **k}
c("reminder-edit", "move-time", "خلي الدكتور الساعة ٧ بدل ٥", "arabic", updates=[{"id": ID(1), "due": "2026-11-20T19:00"}], open_items=[OI(1, "دكتور الأسنان", "2026-11-20T17:00")])
c("reminder-edit", "move-day-en", "move the dentist to Wednesday", "english", updates=[{"id": ID(2), "due": "2026-11-25T18:00"}], open_items=[OI(2, "Dentist", "2026-11-22T18:00")])
c("reminder-edit", "move-day-fr", "el meeting et2agel l bokra nafs el ma3ad", "franco", updates=[{"id": ID(3), "due": "2026-11-20T15:00"}], open_items=[OI(3, "Meeting", "2026-11-19T15:00")])
c("reminder-edit", "done-ar", "خلاص جبت الدوا", "arabic", updates=[{"id": ID(4), "status": "done"}], open_items=[OI(4, "أجيب الدوا", "2026-11-19T12:00")])
c("reminder-edit", "done-en", "done with the laundry", "english", updates=[{"id": ID(5), "status": "done"}], open_items=[OI(5, "Pick up laundry", "2026-11-19T13:00"), OI(6, "Call bank", "2026-11-19T12:00")])
c("reminder-edit", "done-fr", "dafa3t el egar 5alas", "franco", updates=[{"id": ID(7), "status": "done"}], open_items=[OI(7, "دفع الإيجار", "2026-12-05T09:00", type="task")])
c("reminder-edit", "stop-repeat", "stop reminding me about the water", "english", updates=[{"id": ID(8), "status": "cancelled"}], open_items=[OI(8, "Drink water", "2026-11-19T11:00", repeat=60)])
c("reminder-edit", "cancel-asks", "الغي ميعاد الفرح", "arabic", updates=[], ask="confirm", open_items=[OI(9, "فرح", "2026-11-21T20:00")])
c("reminder-edit", "cancel-confirmed", "aywa olgheeh", "franco", updates=[{"id": ID(9), "status": "cancelled"}], open_items=[OI(9, "فرح", "2026-11-21T20:00")], history=[("user", "الغي ميعاد الفرح"), ("assistant", "ألغي ميعاد «فرح» يوم السبت؟")])
c("reminder-edit", "later-1h", "فكرني بيها كمان ساعة", "arabic", updates=[{"id": ID(10), "due": "2026-11-19T11:00"}], open_items=[OI(10, "أكلم خالد", "2026-11-19T10:00")], history=[("assistant", "يلا، ميعاد «أكلم خالد» 📞")])
# ---------- follow-up questions (something is missing) ----------
c("ask", "remind-no-time", "فكرني أكلم خالد", "arabic", ask="time")
c("ask", "remind-no-time-en", "remind me to send the invoice", "english", ask="time")
c("ask", "appointment-no-day", "3andy doctor 3eyoon", "franco", ask="time")
c("ask", "debt-no-amount", "كريم استلف مني فلوس", "arabic", ask="amount")
c("ask", "spend-no-amount", "sagel masroof benzeen", "franco", ask="amount")
c("ask", "split-no-amount", "قسم الحساب بيني وبين حسن وكريم", "arabic", ask="amount")
c("ask", "assign-unknown", "قول لسامح يجيب التورتة", "arabic", ask="person")
c("ask", "alarm-no-time", "اعملي منبه", "arabic", ask="time")
c("ask", "answer-time", "الساعة ٣", "arabic", [R(["خالد"], "2026-11-19T15:00")], history=[("user", "فكرني أكلم خالد"), ("assistant", "حاضر، أفكرك إمتى؟")])
c("ask", "answer-amount", "800", "franco", [D(["كريم", "karim"], 800, "owed_to_me")], history=[("user", "كريم استلف مني فلوس"), ("assistant", "قد إيه؟")])
c("ask", "answer-day", "yom el sabt", "franco", [T(["عيون", "3eyoon", "دكتور"], "2026-11-21")], history=[("user", "3andy doctor 3eyoon"), ("assistant", "إمتى الميعاد؟")])
# ---------- Daftar ----------
c("daftar", "owed-en", "Tarek borrowed 1500 from me", "english", [D(["tarek"], 1500, "owed_to_me")])
c("daftar", "i-owe-ar", "عليا ٣٥٠ لأحمد من الغدا", "arabic", [D(["أحمد", "احمد"], 350, "i_owe")])
c("daftar", "owed-fr", "nour 3aleha 600", "franco", [D(["nour", "نور"], 600, "owed_to_me")])
c("daftar", "i-owe-fr", "ana 3alaya 1000 l khaled", "franco", [D(["khaled", "خالد"], 1000, "i_owe")])
c("daftar", "member-share", "سجل في الدفتر إن Karim عليه ٤٠٠ وابعتله", "arabic", [D(["karim", "كريم"], 400, "owed_to_me")], actions=[{"kind": "daftar_add", "amount": 400, "person_any": ["karim"], "direction": "owed_to_me"}])
c("daftar", "settled-item", "طارق رجعلي الفلوس", "arabic", updates=[{"id": ID(20), "status": "done"}], open_items=[OI(20, "Tarek borrowed 1500", type="debt", debt_person="Tarek", debt_amount=1500, debt_direction="owed_to_me")])
c("daftar", "i-paid-item", "رجعت لأحمد فلوسه", "arabic", updates=[{"id": ID(21), "status": "done"}], open_items=[OI(21, "عليا ٣٥٠ لأحمد", type="debt", debt_person="أحمد", debt_amount=350, debt_direction="i_owe")])
c("daftar", "settle-member", "Hassan paid me back", "english", actions=[{"kind": "daftar_settle", "person_any": ["hassan"]}])
c("daftar", "remind-member", "فكر كريم بالفلوس اللي عليه", "arabic", actions=[{"kind": "daftar_remind", "person_any": ["karim", "كريم"]}])
c("daftar", "cancel-member", "امسح دين حسن من الدفتر", "arabic", actions=[{"kind": "daftar_cancel", "person_any": ["hassan", "حسن"]}])
c("daftar", "open", "show me my daftar", "english", actions=[{"kind": "open_screen", "screen": "daftar"}])
# ---------- money ----------
c("money", "taxi", "spent 85 on uber", "english", actions=[{"kind": "log_money", "amount": 85, "money_kind": "expense", "section_any": ["مواصلات"]}])
c("money", "food-ar", "دفعت ٣٢٠ في السوبر ماركت", "arabic", actions=[{"kind": "log_money", "amount": 320, "money_kind": "expense"}])
c("money", "income-fr", "geli bonus 3000", "franco", actions=[{"kind": "log_money", "amount": 3000, "money_kind": "income"}])
c("money", "budget-en", "set my food budget to 4000", "english", actions=[{"kind": "set_budget", "amount": 4000, "section_any": ["أكل"]}])
c("money", "new-section-fr", "a3mel 2esm gedeed lel madares", "franco", actions=[{"kind": "create_section", "name_any": ["مدارس", "madares"]}])
c("money", "delete-entry-en", "delete the 85 I logged for uber", "english", actions=[{"kind": "delete_money_entry", "amount": 85}])
c("money", "half-k", "صرفت ١٥٠٠ على العربية", "arabic", actions=[{"kind": "log_money", "amount": 1500, "money_kind": "expense", "section_any": ["العربية"]}])
# ---------- circles ----------
c("circle", "create-en", "make a circle for my book club", "english", actions=[{"kind": "create_circle", "name_any": ["book"]}])
c("circle", "create-fr", "a3mel dayra lel 3eela", "franco", actions=[{"kind": "create_circle", "name_any": ["عيلة", "عيله", "3eela"]}])
c("circle", "invite-en", "invite people to the gym gang", "english", actions=[{"kind": "invite", "circle_any": ["الجيم", "gym"]}])
c("circle", "checkin-arrived", "قول لشلة الجيم إني وصلت", "arabic", actions=[{"kind": "checkin", "circle_any": ["الجيم"], "checkin_kind": "arrived"}])
c("circle", "checkin-onway-fr", "2ol lel beit eny fel taree2", "franco", actions=[{"kind": "checkin", "circle_any": ["البيت"], "checkin_kind": "on_way"}])
c("circle", "ask-checkin", "اسأل ليلى وصلت ولا لأ", "arabic", actions=[{"kind": "ask_checkin", "person_any": ["ليلى"]}])
c("circle", "ask-circle-fr", "fakar el beit bel ghada yom el gom3a", "franco", actions=[{"kind": "ask_circle", "circle_any": ["البيت"]}])
c("circle", "rename", "غير اسم شلة الجيم لـ أبطال الجيم", "arabic", actions=[{"kind": "rename_circle", "circle_any": ["شلة الجيم"], "name_any": ["أبطال"]}])
c("circle", "leave-en", "leave the gym circle", "english", actions=[{"kind": "leave_circle", "circle_any": ["الجيم"]}])
# ---------- tasks (assigned to people) ----------
c("task", "assign-due", "قول لعمر يرتب أوضته بكرة", "arabic", actions=[{"kind": "assign_task", "person_any": ["عمر"], "name_any": ["أوض", "اوض", "يرتب"]}])
c("task", "assign-en", "ask Mona to buy milk", "english", actions=[{"kind": "assign_task", "person_any": ["منى"], "name_any": ["milk"]}])
c("task", "assign-fr", "5ali laila tegeeb el 3agala men el mekaneeky", "franco", actions=[{"kind": "assign_task", "person_any": ["ليلى"]}])
c("task", "accept", "تمام هجيبه", "arabic", actions=[{"kind": "task_answer", "person_any": ["منى"], "answer": "yes"}], history=[("assistant", "منى طلبت منك: «تجيب لبن» (البيت)")])
c("task", "decline-en", "no I can't today", "english", actions=[{"kind": "task_answer", "person_any": ["عمر"], "answer": "no"}], history=[("assistant", "عمر asked you: «Fix the wifi» (البيت)")])
c("task", "nudge", "فكر منى باللبن", "arabic", actions=[{"kind": "task_nudge", "person_any": ["منى"]}])
c("task", "cancel", "الغي طلب اللبن من منى", "arabic", actions=[{"kind": "task_cancel", "person_any": ["منى"]}])
# ---------- homework ----------
c("homework", "assign", "خلي ليلى تحل واجب العربي صفحة ٢٠", "arabic", actions=[{"kind": "assign_task", "person_any": ["ليلى"], "name_any": ["واجب", "عربي"]}])
c("homework", "assign-en", "give Omar math homework, page 14", "english", actions=[{"kind": "assign_task", "person_any": ["عمر"], "name_any": ["math", "homework"]}])
c("homework", "well-done", "شطورة، برافو عليها", "arabic", actions=[{"kind": "homework_review", "person_any": ["ليلى"], "answer": "yes"}], history=[("assistant", "ليلى سلّمت واجب «العربي صفحة ٢٠» ✅")])
c("homework", "redo", "لا خليه يعيده تاني", "arabic", actions=[{"kind": "homework_review", "person_any": ["عمر"], "answer": "no"}], history=[("assistant", "عمر سلّم واجب «math page 14» ✅")])
c("homework", "redo-fr", "la2 5aleeha t3eedo", "franco", actions=[{"kind": "homework_review", "person_any": ["ليلى"], "answer": "no"}], history=[("assistant", "ليلى سلّمت واجب «العربي صفحة ٢٠» ✅")])
# ---------- trackers ----------
c("tracker", "create-water-en", "track my water, goal 10 glasses", "english", actions=[{"kind": "update_tracker", "amount": 10}])
c("tracker", "create-sleep", "عايز أتابع نومي", "arabic", actions=[{"kind": "create_tracker", "tracker_kind": "sleep"}])
c("tracker", "create-custom-fr", "3ayez atabe3 el gym 3 marat fel esbo3", "franco", actions=[{"kind": "create_tracker", "name_any": ["جيم", "gym"]}])
c("tracker", "log-water", "شربت ٢ كوباية مية", "arabic", actions=[{"kind": "log_tracker", "amount": 2, "name_any": ["water", "مية", "ميه"]}])
c("tracker", "log-steps-en", "walked 6500 steps today", "english", actions=[{"kind": "log_tracker", "amount": 6500, "name_any": ["steps", "خطوات"]}])
c("tracker", "log-reading-fr", "2reet 15 saf7a", "franco", actions=[{"kind": "log_tracker", "amount": 15, "name_any": ["قراية"]}])
c("tracker", "goal", "خلي هدف القراية ٣٠ صفحة", "arabic", actions=[{"kind": "update_tracker", "amount": 30, "name_any": ["قراية"]}])
c("tracker", "ask-times-en", "ask me about water at 9, 1 and 5", "english", actions=[{"kind": "update_tracker", "ask_times": ["09:00", "13:00", "17:00"]}])
c("tracker", "undo", "undo that, I didn't drink it", "english", actions=[{"kind": "undo_tracker", "name_any": ["water", "مية"]}], history=[("user", "drank water"), ("assistant", "Nice, 4 of 8 💧")])
c("tracker", "delete", "امسح متابعة القراية", "arabic", actions=[{"kind": "delete_tracker", "name_any": ["قراية"]}])
# ---------- split the bill ----------
c("split", "en", "split 1200 dinner between me, Hassan and Karim", "english", actions=[{"kind": "split_bill", "amount": 1200, "people_all": ["Hassan", "Karim"]}])
c("split", "fr", "2asem 750 ben ana w mona w omar", "franco", actions=[{"kind": "split_bill", "amount": 750, "people_all": ["منى", "عمر"]}])
c("split", "ar-pizza", "قسم ٤٨٠ بيتزا عليا وعلى ليلى", "arabic", actions=[{"kind": "split_bill", "amount": 480, "people_all": ["ليلى"]}])
c("split", "paid", "Karim paid his share of the split", "english", actions=[{"kind": "split_paid", "person_any": ["karim"]}])
c("split", "open", "افتح قسمة الحساب", "arabic", actions=[{"kind": "open_screen", "screen": "split"}])
# ---------- Today / plans / screens ----------
c("today", "open", "وريني النهارده", "arabic", actions=[{"kind": "open_screen", "screen": "today"}])
c("today", "what-today-en", "what's on today?", "english", open_items=[OI(30, "Call bank", "2026-11-19T12:00")])
c("today", "what-week-fr", "3andy eh el esbo3 da", "franco", open_items=[OI(31, "Dentist", "2026-11-22T18:00")])
c("today", "open-trackers", "open my trackers", "english", actions=[{"kind": "open_screen", "screen": "trackers"}])
# ---------- memories / settings ----------
c("memory", "sister", "Laila is my daughter, she's 9", "english", mem=["laila"])
c("memory", "allergy-ar", "أنا عندي حساسية من الفول السوداني", "arabic", mem=["حساسية", "سوداني"])
c("memory", "forget-en", "forget that I like football", "english", actions=[{"kind": "forget", "text_any": ["football"]}])
c("memory", "sleep-time", "بنام الساعة ١٢ دلوقتي، عدلها", "arabic", actions=[{"kind": "settings", "setting": "sleep_time", "text_any": ["00:00", "24:00", "12"]}])
c("memory", "male", "kalemny bel mozakar", "franco", actions=[{"kind": "settings", "setting": "address", "text_any": ["male"]}])
# ---------- must NOT act (chat) ----------
c("chat", "past-doctor", "كنت عند الدكتور امبارح والحمد لله كويس", "arabic")
c("chat", "price-talk", "prices are crazy, a coffee is 120 now", "english")
c("chat", "football-fr", "el match bokra el sa3a 9 hayb2a nar", "franco")
c("chat", "tired-ar", "تعبت النهارده من الشغل ومش قادر", "arabic")
c("chat", "question-money", "how much did I spend on food this month?", "english")
c("chat", "joke", "قولي نكتة", "arabic")
c("chat", "crisis", "مبقتش عايز أعيش", "arabic", crisis=True)

path = os.path.join(os.path.dirname(__file__), "holdout.jsonl")
with open(path, "w") as f:
    for x in cases: f.write(json.dumps(x, ensure_ascii=False) + "\n")
print(len(cases), "cases")
