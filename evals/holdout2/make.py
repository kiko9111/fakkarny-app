# Second held-out set for Zaki's rule engine (2026-11-25), written after the engine reached 100% on
# the first two sets and BEFORE running it on these, to measure misses on phrasings it never saw.
# NOW is Thu 2026-11-19 10:00 Cairo: Fri 20, Sat 21, Sun 22, Mon 23, Tue 24, Wed 25, Thu 26.
# Regenerate: python3 evals/holdout2/make.py
import json, os
APP = {"circles": [{"name": "البيت", "kind": "family", "members": ["منى", "عمر", "ليلى"]},
                   {"name": "شلة الجيم", "kind": "friends", "members": ["Hassan", "Karim"]}],
       "sections": [{"name": "أكل", "kind": "expense", "budget": 3000}, {"name": "العربية", "kind": "expense"},
                    {"name": "مواصلات", "kind": "expense"}, {"name": "مرتب", "kind": "income"}],
       "trackers": [{"kind": "water", "goal": 8}, {"kind": "custom", "name": "القراية", "goal": 20}, {"kind": "custom", "name": "الخطوات", "goal": 8000}]}
ID = lambda n: f"{n:08x}-0000-4000-8000-{n:012d}"
cases = []
def c(area, cid, msg, script, items=(), actions=None, updates=None, ask=None, mem=None, open_items=(), history=(), crisis=None):
    e = {"script": script, "items": list(items)}
    if actions is not None: e["actions"] = actions
    if updates is not None: e["updates"] = updates
    if ask: e["ask"] = ask
    if mem: e["memories_any"] = mem
    if crisis is not None: e["crisis"] = crisis
    x = {"id": f"h2-{area}-{cid}", "area": area, "app": APP, "message": msg, "expect": e}
    if open_items: x["open_items"] = list(open_items)
    if history: x["history"] = [{"role": r, "text": t} for r, t in history]
    cases.append(x)
R = lambda title, due=None, **k: {"type": "reminder", **({"title_any": title} if title else {}), **({"due": due} if due else {}), **k}
T = lambda title, date=None, **k: {"type_any": ["reminder", "task"], "title_any": title, **({"due_date": date} if date else {}), **k}
D = lambda person, amount, direction, **k: {"type": "debt", "debt": {"person_any": person, "amount": amount, "direction": direction}, **k}
OI = lambda n, t, due=None, **k: {"id": ID(n), "type": k.pop("type", "reminder"), "title": t, **({"due_local": due} if due else {}), **k}

# ---------- reminders: create ----------
c("reminder", "en-tmrw-730", "remind me tomorrow at 7:30 to put the trash out", "english", [R(["trash"], "2026-11-20T07:30")])
c("reminder", "en-sat-morning", "I need to renew my car license on Saturday morning", "english", [R(["license"], "2026-11-21T09:00")])
c("reminder", "en-in-20min", "remind me in 20 minutes to check the oven", "english", [R(["oven"], "2026-11-19T10:20")])
c("reminder", "en-thu-next", "parent teacher meeting next Thursday at 1pm", "english", [R(["teacher", "meeting"], "2026-11-26T13:00")])
c("reminder", "en-flight", "my flight to Dubai is on Tuesday at 6am", "english", [R(["flight", "dubai"], "2026-11-24T06:00", important=True)])
c("reminder", "ar-tmrw-3", "فكريني بكرة الساعة ٣ أروح الكوافير", "arabic", [R(["كوافير"], "2026-11-20T15:00")])
c("reminder", "ar-sun-doctor", "عندي دكتور عيون يوم الأحد الساعة ٥ ونص", "arabic", [R(["عيون", "دكتور"], "2026-11-22T17:30", follow_up=True)])
c("reminder", "ar-in-2h", "فكرني بعد ساعتين أشيل الأكل من الفريزر", "arabic", [R(["فريزر", "الأكل"], "2026-11-19T12:00")])
c("reminder", "ar-tonight", "النهارده بالليل لازم أكلم ماما", "arabic", [R(["ماما"], "2026-11-19T21:00")])
c("reminder", "ar-exam", "امتحان عمر يوم الاتنين الساعة ٩ الصبح", "arabic", [R(["امتحان"], "2026-11-23T09:00", important=True, follow_up=True)])
c("reminder", "ar-every-fri", "فكرني كل جمعة الساعة ١١ أكلم تيتا", "arabic", [R(["تيتا"], "2026-11-20T11:00", repeat=10080)])
c("reminder", "ar-every-2h", "فكرني كل ساعتين أشرب مية", "arabic", [R(["مية", "ميه"], "2026-11-19T12:00", repeat=120)])
c("reminder", "fr-tmrw-8", "fakarny bokra el sa3a 8 belleil a3mel el report", "franco", [R(["تقرير", "report"], "2026-11-20T20:00")])
c("reminder", "fr-kaman-sa3a", "fakarny kaman sa3a akalem khaled", "franco", [R(["خالد", "khaled"], "2026-11-19T11:00")])
c("reminder", "fr-sat-fara7", "yom el sabt 3andy fara7 el sa3a 7", "franco", [R(["فرح", "fara7"], "2026-11-21T19:00")])
c("reminder", "fr-alarm-6", "e3mely mnabeh el sa3a 6 el sob7", "franco", [R([], "2026-11-20T06:00", alarm=True)])
c("reminder", "ar-alarm", "صحيني بكرة الساعة ٧", "arabic", [R([], "2026-11-20T07:00", alarm=True)])
c("reminder", "ar-two-times", "فكرني آخد الفيتامين الساعة ٢ و ٨", "arabic", [R(["فيتامين"], "2026-11-19T14:00"), R(["فيتامين"], "2026-11-19T20:00")])
c("reminder", "en-two-in-one", "remind me to call Ahmed at 4 and remind me to buy bread at 6", "english", [R(["ahmed"], "2026-11-19T16:00"), R(["bread"], "2026-11-19T18:00")])
c("reminder", "ar-day-date", "يوم ٢٥ لازم أدفع القسط", "arabic", [T(["قسط"], "2026-11-25")])
c("reminder", "en-by-friday", "I have to submit the tax form by Friday", "english", [T(["tax"], "2026-11-20")])
c("reminder", "fr-ba3d-bokra", "ba3d bokra lazem arou7 el bank", "franco", [T(["بنك", "bank"], "2026-11-21")])
c("reminder", "ar-wed-gym", "الأربع الجاي عندي تمرين الساعة ٨ بالليل", "arabic", [R(["تمرين"], "2026-11-25T20:00")])
c("reminder", "en-noon-pills", "remind me to take my meds at noon", "english", [R(["meds"], "2026-11-19T12:00", important=True)])
# ---------- reminders: change / finish / stop ----------
c("reminder-edit", "en-push-hour", "push the oven reminder by an hour", "english", updates=[{"id": ID(1), "due": "2026-11-19T11:20"}], open_items=[OI(1, "Check the oven", "2026-11-19T10:20")])
c("reminder-edit", "ar-move-sat", "أجل الكوافير ليوم السبت", "arabic", updates=[{"id": ID(2), "due": "2026-11-21T15:00"}], open_items=[OI(2, "أروح الكوافير", "2026-11-20T15:00")])
c("reminder-edit", "fr-ghayar-sa3a", "ghayar ma3ad el doctor l el sa3a 6", "franco", updates=[{"id": ID(3), "due": "2026-11-22T18:00"}], open_items=[OI(3, "دكتور عيون", "2026-11-22T17:30")])
c("reminder-edit", "en-done-trash", "took the trash out", "english", updates=[{"id": ID(4), "status": "done"}], open_items=[OI(4, "Put the trash out", "2026-11-20T07:30"), OI(5, "Call bank", "2026-11-19T12:00")])
c("reminder-edit", "ar-done-mama", "كلمت ماما خلاص", "arabic", updates=[{"id": ID(6), "status": "done"}], open_items=[OI(6, "أكلم ماما", "2026-11-19T21:00")])
c("reminder-edit", "fr-done-bank", "ro7t el bank w 5alast", "franco", updates=[{"id": ID(7), "status": "done"}], open_items=[OI(7, "أروح البنك", "2026-11-21T09:00", type="task")])
c("reminder-edit", "ar-stop-water", "بطل تفكرني بالمية", "arabic", updates=[{"id": ID(8), "status": "cancelled"}], open_items=[OI(8, "أشرب مية", "2026-11-19T12:00", repeat=120)])
c("reminder-edit", "en-cancel-asks", "cancel the dentist", "english", updates=[], ask="confirm", open_items=[OI(9, "Dentist", "2026-11-22T18:00")])
c("reminder-edit", "en-cancel-yes", "yes cancel it", "english", updates=[{"id": ID(9), "status": "cancelled"}], open_items=[OI(9, "Dentist", "2026-11-22T18:00")], history=[("user", "cancel the dentist"), ("assistant", "Cancel «Dentist» on Sunday?")])
c("reminder-edit", "ar-later-30", "فكرني بعد نص ساعة", "arabic", updates=[{"id": ID(10), "due": "2026-11-19T10:30"}], open_items=[OI(10, "أكلم خالد", "2026-11-19T10:00")], history=[("assistant", "يلا، ميعاد «أكلم خالد» 📞")])
c("reminder-edit", "en-repeat-done-stays", "done, drank it", "english", updates=[], open_items=[OI(11, "Drink water", "2026-11-19T11:00", repeat=60)], history=[("assistant", "Time for «Drink water» 💧")])
# ---------- asks ----------
c("ask", "en-remind-no-time", "remind me to pay the electricity bill", "english", ask="time")
c("ask", "fr-remind-no-time", "fakarny ab3at el egar", "franco", ask="time")
c("ask", "ar-alarm-no-time", "اعمل منبه بكرة", "arabic", ask="time")
c("ask", "en-debt-no-amount", "Tarek owes me money", "english", ask="amount")
c("ask", "ar-split-no-people", "قسم ٩٠٠ الغدا", "arabic", ask="person")
c("ask", "en-assign-unknown", "ask Samir to bring the chairs", "english", ask="person")
c("ask", "ar-answer-time", "٥ العصر", "arabic", [R(["كهربا", "الكهربا"], "2026-11-19T17:00")], history=[("user", "فكرني أدفع الكهربا"), ("assistant", "أكيد، الساعة كام؟")])
c("ask", "en-answer-amount", "1500", "english", [D(["tarek"], 1500, "owed_to_me")], history=[("user", "Tarek owes me money"), ("assistant", "How much does he owe you?")])
# ---------- Daftar ----------
c("daftar", "en-lent", "I lent Youssef 2000", "english", [D(["youssef", "يوسف"], 2000, "owed_to_me")])
c("daftar", "en-i-owe", "I owe Sara 300 for the tickets", "english", [D(["sara", "سارة"], 300, "i_owe")])
c("daftar", "ar-lent", "سلفت محمود ٥٠٠ جنيه", "arabic", [D(["محمود"], 500, "owed_to_me")])
c("daftar", "ar-i-owe", "عليا ٧٥٠ لخالتي", "arabic", [D(["خالت"], 750, "i_owe")])
c("daftar", "fr-borrowed", "mahmoud 5ad meny 1200", "franco", [D(["محمود", "mahmoud"], 1200, "owed_to_me")])
c("daftar", "en-settled", "Youssef gave me back the 2000", "english", updates=[{"id": ID(20), "status": "done"}], open_items=[OI(20, "Youssef owes 2000", type="debt", debt_person="Youssef", debt_amount=2000, debt_direction="owed_to_me")])
c("daftar", "fr-settled", "sara rag3etly el felous", "franco", updates=[{"id": ID(21), "status": "done"}], open_items=[OI(21, "سارة عليها ٣٠٠", type="debt", debt_person="سارة", debt_amount=300, debt_direction="owed_to_me")])
c("daftar", "ar-remind-member", "فكر حسن بالفلوس اللي عليه", "arabic", actions=[{"kind": "daftar_remind", "person_any": ["hassan", "حسن"]}])
c("daftar", "en-settle-member", "Karim paid me back", "english", actions=[{"kind": "daftar_settle", "person_any": ["karim"]}])
c("daftar", "ar-open", "افتح الدفتر", "arabic", actions=[{"kind": "open_screen", "screen": "daftar"}])
# ---------- money ----------
c("money", "en-lunch", "spent 140 on lunch", "english", actions=[{"kind": "log_money", "amount": 140, "money_kind": "expense", "section_any": ["أكل"]}])
c("money", "ar-benzine", "حطيت بنزين بـ ٤٠٠", "arabic", actions=[{"kind": "log_money", "amount": 400, "money_kind": "expense", "section_any": ["العربية"]}])
c("money", "fr-taxi", "dafa3t 60 taxi", "franco", actions=[{"kind": "log_money", "amount": 60, "money_kind": "expense", "section_any": ["مواصلات"]}])
c("money", "ar-salary", "قبضت المرتب ١٢ ألف", "arabic", actions=[{"kind": "log_money", "amount": 12000, "money_kind": "income", "section_any": ["مرتب"]}])
c("money", "en-budget-car", "set a 2000 budget for the car", "english", actions=[{"kind": "set_budget", "amount": 2000, "section_any": ["العربية"]}])
c("money", "en-new-section", "add a new section called gifts", "english", actions=[{"kind": "create_section", "name_any": ["gift"]}])
c("money", "ar-open", "وريني مصاريفي", "arabic", actions=[{"kind": "open_screen", "screen": "money"}])
# ---------- circles ----------
c("circle", "ar-create", "اعمل دايرة جديدة للشغل", "arabic", actions=[{"kind": "create_circle", "name_any": ["شغل"]}])
c("circle", "en-invite-family", "send an invite to the family circle", "english", actions=[{"kind": "invite", "circle_any": ["البيت"]}])
c("circle", "en-home", "tell the family I'm home", "english", actions=[{"kind": "checkin", "circle_any": ["البيت"], "checkin_kind": "home"}])
c("circle", "fr-arrived", "2ol l shelet el gym eny wselt", "franco", actions=[{"kind": "checkin", "circle_any": ["الجيم"], "checkin_kind": "arrived"}])
c("circle", "ar-ask-checkin", "اسأل ليلى وصلت ولا لا", "arabic", actions=[{"kind": "ask_checkin", "person_any": ["ليلى"]}])
c("circle", "en-leave", "leave the gym gang circle", "english", actions=[{"kind": "leave_circle", "circle_any": ["الجيم"]}])
c("circle", "ar-open", "افتح الدواير", "arabic", actions=[{"kind": "open_screen", "screen": "circles"}])
# ---------- tasks ----------
c("task", "ar-assign", "قول لليلى تجيب عيش وهي راجعة", "arabic", actions=[{"kind": "assign_task", "person_any": ["ليلى"], "name_any": ["عيش"]}])
c("task", "en-assign", "tell Omar to take out the trash", "english", actions=[{"kind": "assign_task", "person_any": ["عمر"], "name_any": ["trash"]}])
c("task", "fr-assign", "2ol l mona tegeeb laban", "franco", actions=[{"kind": "assign_task", "person_any": ["منى"]}])
c("task", "en-accept", "sure, I'll do it", "english", actions=[{"kind": "task_answer", "person_any": ["ليلى"], "answer": "yes"}], history=[("assistant", "ليلى asked you: «Pick me up at 5» (البيت)")])
c("task", "ar-decline", "لا مش هينفع", "arabic", actions=[{"kind": "task_answer", "person_any": ["عمر"], "answer": "no"}], history=[("assistant", "عمر طلب منك: «توصله التمرين» (البيت)")])
c("task", "en-nudge", "nudge Omar about the trash", "english", actions=[{"kind": "task_nudge", "person_any": ["عمر"]}])
c("task", "en-cancel", "cancel the task I gave Mona", "english", actions=[{"kind": "task_cancel", "person_any": ["منى"]}])
# ---------- homework ----------
c("homework", "ar-assign", "خلي عمر يذاكر درس العلوم ويحل التمارين", "arabic", actions=[{"kind": "assign_task", "person_any": ["عمر"], "name_any": ["علوم", "درس"]}])
c("homework", "fr-assign", "5ali laila te7el wageb el math", "franco", actions=[{"kind": "assign_task", "person_any": ["ليلى"]}])
c("homework", "en-well-done", "great job, tell him I'm proud", "english", actions=[{"kind": "homework_review", "person_any": ["عمر"], "answer": "yes"}], history=[("assistant", "عمر handed in homework «Science lesson» ✅")])
c("homework", "ar-redo", "مش كفاية، تعيده تاني", "arabic", actions=[{"kind": "homework_review", "person_any": ["ليلى"], "answer": "no"}], history=[("assistant", "ليلى سلّمت واجب «ماث» ✅")])
c("homework", "fr-well-done", "brafo 3aleh", "franco", actions=[{"kind": "homework_review", "person_any": ["عمر"], "answer": "yes"}], history=[("assistant", "عمر سلّم واجب «العلوم» ✅")])
# ---------- trackers ----------
c("tracker", "en-log-water", "had 3 glasses of water", "english", actions=[{"kind": "log_tracker", "amount": 3, "name_any": ["water", "مية"]}])
c("tracker", "fr-log-water", "shrebt kobayet maya", "franco", actions=[{"kind": "log_tracker", "name_any": ["water", "مية"]}])
c("tracker", "ar-log-reading", "قريت ١٠ صفحات النهارده", "arabic", actions=[{"kind": "log_tracker", "amount": 10, "name_any": ["قراية"]}])
c("tracker", "ar-log-steps", "مشيت ٤٠٠٠ خطوة", "arabic", actions=[{"kind": "log_tracker", "amount": 4000, "name_any": ["خطوات"]}])
c("tracker", "en-create-prayer", "I want to track my prayers", "english", actions=[{"kind": "create_tracker", "tracker_kind": "prayer"}])
c("tracker", "ar-create-quran", "تابع معايا القرآن", "arabic", actions=[{"kind": "create_tracker", "tracker_kind": "quran"}])
c("tracker", "en-goal-steps", "change my steps goal to 10000", "english", actions=[{"kind": "update_tracker", "amount": 10000, "name_any": ["خطوات"]}])
c("tracker", "ar-delete", "امسح متابعة الخطوات", "arabic", actions=[{"kind": "delete_tracker", "name_any": ["خطوات"]}])
c("tracker", "en-open", "show me my trackers", "english", actions=[{"kind": "open_screen", "screen": "trackers"}])
# ---------- split the bill ----------
c("split", "ar", "قسم ١٥٠٠ العشا بيني وبين منى وعمر", "arabic", actions=[{"kind": "split_bill", "amount": 1500, "people_all": ["منى", "عمر"]}])
c("split", "en", "split the 600 taxi with Hassan", "english", actions=[{"kind": "split_bill", "amount": 600, "people_all": ["Hassan"]}])
c("split", "fr", "2asem el 900 ben ana w karim w hassan", "franco", actions=[{"kind": "split_bill", "amount": 900, "people_all": ["Karim", "Hassan"]}])
c("split", "en-no-amount", "split the bill with Karim", "english", ask="amount")
c("split", "ar-paid", "حسن دفع نصيبه", "arabic", actions=[{"kind": "split_paid", "person_any": ["hassan", "حسن"]}])
# ---------- today ----------
c("today", "ar-open", "افتح النهارده", "arabic", actions=[{"kind": "open_screen", "screen": "today"}])
c("today", "en-whats-tomorrow", "what do I have tomorrow?", "english", open_items=[OI(40, "Put the trash out", "2026-11-20T07:30")])
c("today", "ar-what-today", "عندي إيه النهارده؟", "arabic", open_items=[OI(41, "أكلم ماما", "2026-11-19T21:00")])
# ---------- memories / settings ----------
c("memory", "en-wife", "my wife's name is Nour", "english", mem=["nour"])
c("memory", "ar-likes", "أنا بحب القهوة من غير سكر", "arabic", mem=["قهوة", "سكر"])
c("memory", "ar-forget", "انسى إني بحب الكورة", "arabic", actions=[{"kind": "forget", "text_any": ["الكورة", "كورة"]}])
c("memory", "en-wake", "I wake up at 6 now, update it", "english", actions=[{"kind": "settings", "setting": "wake_time", "text_any": ["06:00"]}])
c("memory", "en-female", "talk to me as a woman please", "english", actions=[{"kind": "settings", "setting": "address", "text_any": ["female"]}])
# ---------- must NOT act ----------
c("chat", "en-past", "went to the dentist yesterday, it was fine", "english")
c("chat", "ar-weather", "الجو حلو أوي النهارده", "arabic")
c("chat", "fr-hi", "ezayak ya zaki 3amel eh", "franco")
c("chat", "en-thanks", "thanks, you're the best", "english")
c("chat", "ar-question", "إيه أحسن وقت للمذاكرة؟", "arabic")
c("chat", "en-tv", "the new episode comes out Friday at 9, can't wait", "english")
c("chat", "ar-story", "منى اتخانقت مع صاحبتها النهارده", "arabic")
c("chat", "fr-sad", "ana z3lan shwaya", "franco")
c("chat", "en-price", "eggs cost 200 now, insane", "english")
c("chat", "ar-crisis", "نفسي أموت وأرتاح", "arabic", crisis=True)
c("chat", "en-crisis", "I want to kill myself", "english", crisis=True)

path = os.path.join(os.path.dirname(__file__), "holdout2.jsonl")
with open(path, "w") as f:
    for x in cases: f.write(json.dumps(x, ensure_ascii=False) + "\n")
print(len(cases), "cases")
