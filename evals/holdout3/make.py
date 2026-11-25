# Third held-out set for Zaki's rule engine (2026-11-25), written after the engine reached 100% on
# the first two sets and BEFORE running it on these, to measure misses on phrasings it never saw.
# NOW is Thu 2026-11-19 10:00 Cairo: Fri 20, Sat 21, Sun 22, Mon 23, Tue 24, Wed 25, Thu 26.
# Regenerate: python3 evals/holdout3/make.py
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
    x = {"id": f"h3-{area}-{cid}", "area": area, "app": APP, "message": msg, "expect": e}
    if open_items: x["open_items"] = list(open_items)
    if history: x["history"] = [{"role": r, "text": t} for r, t in history]
    cases.append(x)
R = lambda title, due=None, **k: {"type": "reminder", **({"title_any": title} if title else {}), **({"due": due} if due else {}), **k}
T = lambda title, date=None, **k: {"type_any": ["reminder", "task"], "title_any": title, **({"due_date": date} if date else {}), **k}
D = lambda person, amount, direction, **k: {"type": "debt", "debt": {"person_any": person, "amount": amount, "direction": direction}, **k}
OI = lambda n, t, due=None, **k: {"id": ID(n), "type": k.pop("type", "reminder"), "title": t, **({"due_local": due} if due else {}), **k}

# Written after the engine reached 99% on the first three sets, BEFORE running the engine or any
# model on it: the common unseen test for code alone, the model's rewrite, and both together.
# Messier on purpose: typos, missing spaces, mixed scripts, long chatty messages.

# ---------- reminders ----------
c("reminder", "en-typo", "remnd me tmrw at 10 to call the plumber", "english", [R(["plumber"], "2026-11-20T10:00")])
c("reminder", "en-chatty", "ugh so much to do, can you remind me to pick up Omar from school at 2", "english", [R(["omar", "school"], "2026-11-19T14:00")])
c("reminder", "en-sunday-eve", "Sunday evening I have a call with the bank", "english", [R(["bank", "call"], "2026-11-22T19:00")])
c("reminder", "en-every-morning", "every morning at 7 remind me to stretch", "english", [R(["stretch"], "2026-11-20T07:00", repeat=1440)])
c("reminder", "en-in-45", "in 45 mins remind me to take the cake out", "english", [R(["cake"], "2026-11-19T10:45")])
c("reminder", "ar-typo", "فكرنى بكره الساعه ٤ اكلم الدكتوره", "arabic", [R(["دكتور"], "2026-11-20T16:00")])
c("reminder", "ar-long", "معلش يا زكي عندي حاجات كتير، فكرني الساعة ٦ المغرب أجيب العيال من النادي", "arabic", [R(["العيال", "النادي"], "2026-11-19T18:00")])
c("reminder", "ar-mon-interview", "الاتنين الجاي عندي انترفيو الساعة ١١", "arabic", [R(["انترفيو"], "2026-11-23T11:00", follow_up=True, important=True)])
c("reminder", "ar-kaman-rob3", "فكرني كمان ربع ساعة أقلب الأكل", "arabic", [R(["الأكل", "اقلب", "أقلب"], "2026-11-19T10:15")])
c("reminder", "ar-every-day-9", "كل يوم الساعة ٩ بالليل فكرني بالدوا", "arabic", [R(["دوا"], "2026-11-19T21:00", repeat=1440, important=True)])
c("reminder", "fr-glued", "fakarnybokraasa3a3akalemmama", "franco", [R(["ماما", "mama"], "2026-11-20T15:00")])
c("reminder", "fr-typo", "fkrny bkra 11 el sob7 ro7 el bank", "franco", [R(["بنك", "bank"], "2026-11-20T11:00")])
c("reminder", "fr-sat-dentist", "yom el sabt 3andy doctor asnan el sa3a 1 el dohr", "franco", [R(["سنان", "asnan", "دكتور"], "2026-11-21T13:00", follow_up=True)])
c("reminder", "fr-tonight", "enharda belleil lazem a5alas el presentation", "franco", [R(["presentation", "بريزنتيشن"], "2026-11-19T21:00")])
c("reminder", "fr-alarm", "7ot mnabeh 5:45", "franco", [R([], "2026-11-20T05:45", alarm=True)])
c("reminder", "mixed", "bokra meeting with the manager el sa3a 12", "franco", [R(["meeting", "ميتنج", "المدير"], "2026-11-20T12:00")])
# ---------- edits ----------
c("reminder-edit", "en-move-plumber", "change the plumber to 11", "english", updates=[{"id": ID(1), "due": "2026-11-20T11:00"}], open_items=[OI(1, "Call the plumber", "2026-11-20T10:00")])
c("reminder-edit", "ar-move-day", "خلي ميعاد الدكتورة يوم السبت بدل بكرة", "arabic", updates=[{"id": ID(2), "due": "2026-11-21T16:00"}], open_items=[OI(2, "أكلم الدكتورة", "2026-11-20T16:00")])
c("reminder-edit", "fr-done", "kalemt el sabak 5alas", "franco", updates=[{"id": ID(3), "status": "done"}], open_items=[OI(3, "أكلم السباك", "2026-11-19T12:00")])
c("reminder-edit", "en-done", "picked Omar up", "english", updates=[{"id": ID(4), "status": "done"}], open_items=[OI(4, "Pick up Omar from school", "2026-11-19T14:00")])
c("reminder-edit", "ar-stop", "مش عايز تفكرني بالدوا تاني", "arabic", updates=[{"id": ID(5), "status": "cancelled"}], open_items=[OI(5, "الدوا", "2026-11-19T21:00", repeat=1440)])
c("reminder-edit", "fr-cancel-ask", "olghy el meeting", "franco", updates=[], ask="confirm", open_items=[OI(6, "Meeting", "2026-11-20T12:00")])
c("reminder-edit", "ar-later", "أجلها ساعة", "arabic", updates=[{"id": ID(7), "due": "2026-11-19T11:00"}], open_items=[OI(7, "أقلب الأكل", "2026-11-19T10:00")], history=[("assistant", "يلا، ميعاد «أقلب الأكل» 🍳")])
# ---------- asks ----------
c("ask", "en-no-time", "remind me to water the plants", "english", ask="time")
c("ask", "ar-no-time", "فكرني أشتري هدية لمنى", "arabic", ask="time")
c("ask", "fr-no-amount", "karim estalaf meny felous", "franco", ask="amount")
c("ask", "en-split-no-amount", "split dinner with Mona and Omar", "english", ask="amount")
c("ask", "ar-answer", "بكرة الساعة ١٠", "arabic", [R(["زرع", "الزرع"], "2026-11-20T10:00")], history=[("user", "فكرني أسقي الزرع"), ("assistant", "إمتى أفكرك؟")])
# ---------- Daftar ----------
c("daftar", "en-owes", "Nour owes me 450 for the concert", "english", [D(["nour"], 450, "owed_to_me")])
c("daftar", "ar-owes", "هبة عليها ٢٠٠ من الرحلة", "arabic", [D(["هبة", "هبه"], 200, "owed_to_me")])
c("daftar", "fr-i-owe", "3alaya 500 l 7assan", "franco", [D(["حسن", "hassan"], 500, "i_owe")])
c("daftar", "ar-borrowed-from", "استلفت ١٠٠٠ من بابا", "arabic", [D(["بابا"], 1000, "i_owe")])
c("daftar", "en-settled", "Nour paid me back", "english", updates=[{"id": ID(20), "status": "done"}], open_items=[OI(20, "Nour owes 450", type="debt", debt_person="Nour", debt_amount=450, debt_direction="owed_to_me")])
c("daftar", "ar-remind", "فكر Karim بالفلوس", "arabic", actions=[{"kind": "daftar_remind", "person_any": ["karim"]}])
# ---------- money ----------
c("money", "en-coffee", "paid 75 for coffee", "english", actions=[{"kind": "log_money", "amount": 75, "money_kind": "expense", "section_any": ["أكل"]}])
c("money", "ar-uber", "دفعت ١٢٠ اوبر", "arabic", actions=[{"kind": "log_money", "amount": 120, "money_kind": "expense", "section_any": ["مواصلات"]}])
c("money", "fr-akl", "saraft 250 3al akl", "franco", actions=[{"kind": "log_money", "amount": 250, "money_kind": "expense", "section_any": ["أكل"]}])
c("money", "en-income", "got paid 9000 today", "english", actions=[{"kind": "log_money", "amount": 9000, "money_kind": "income"}])
c("money", "ar-budget", "خلي ميزانية المواصلات ١٠٠٠", "arabic", actions=[{"kind": "set_budget", "amount": 1000, "section_any": ["مواصلات"]}])
# ---------- circles ----------
c("circle", "en-create", "create a group for the neighbors", "english", actions=[{"kind": "create_circle", "name_any": ["neighbor"]}])
c("circle", "ar-onway", "قول للبيت إني جاي في الطريق", "arabic", actions=[{"kind": "checkin", "circle_any": ["البيت"], "checkin_kind": "on_way"}])
c("circle", "fr-invite", "ab3at da3wa l shelet el gym", "franco", actions=[{"kind": "invite", "circle_any": ["الجيم"]}])
c("circle", "en-ask", "ask Laila if she got home", "english", actions=[{"kind": "ask_checkin", "person_any": ["ليلى"]}])
# ---------- tasks / homework ----------
c("task", "ar-assign", "قول لمنى تجيب لبن وهي جاية", "arabic", actions=[{"kind": "assign_task", "person_any": ["منى"], "name_any": ["لبن"]}])
c("task", "en-assign", "ask Karim to book the field for friday", "english", actions=[{"kind": "assign_task", "person_any": ["karim"]}])
c("task", "fr-accept", "aywa hagibo", "franco", actions=[{"kind": "task_answer", "person_any": ["منى"], "answer": "yes"}], history=[("assistant", "منى طلبت منك: «تجيب عيش» (البيت)")])
c("task", "en-nudge", "remind Mona about the milk", "english", actions=[{"kind": "task_nudge", "person_any": ["منى"]}])
c("homework", "ar-assign", "خلي ليلى تذاكر الإنجليزي صفحة ٣٠", "arabic", actions=[{"kind": "assign_task", "person_any": ["ليلى"], "name_any": ["انجليزي", "إنجليزي"]}])
c("homework", "en-redo", "not good enough, ask him to redo it", "english", actions=[{"kind": "homework_review", "person_any": ["عمر"], "answer": "no"}], history=[("assistant", "عمر handed in homework «Math p.12» ✅")])
c("homework", "ar-good", "حلو أوي، برافو", "arabic", actions=[{"kind": "homework_review", "person_any": ["ليلى"], "answer": "yes"}], history=[("assistant", "ليلى سلّمت واجب «الإنجليزي» ✅")])
# ---------- trackers ----------
c("tracker", "en-water", "drank 2 glasses of water", "english", actions=[{"kind": "log_tracker", "amount": 2, "name_any": ["water", "مية"]}])
c("tracker", "ar-water", "شربت كوباية مية", "arabic", actions=[{"kind": "log_tracker", "name_any": ["water", "مية"]}])
c("tracker", "fr-reading", "2areet 12 saf7a enharda", "franco", actions=[{"kind": "log_tracker", "amount": 12, "name_any": ["قراية"]}])
c("tracker", "en-steps", "did 9000 steps", "english", actions=[{"kind": "log_tracker", "amount": 9000, "name_any": ["خطوات"]}])
c("tracker", "ar-create", "عايز أتابع الصلاة", "arabic", actions=[{"kind": "create_tracker", "tracker_kind": "prayer"}])
c("tracker", "en-delete", "delete the steps tracker", "english", actions=[{"kind": "delete_tracker", "name_any": ["خطوات"]}])
# ---------- split ----------
c("split", "en", "split 840 between me Mona and Laila", "english", actions=[{"kind": "split_bill", "amount": 840, "people_all": ["منى", "ليلى"]}])
c("split", "ar", "قسم الـ ٦٠٠ بيني وبين كريم", "arabic", actions=[{"kind": "split_bill", "amount": 600, "people_all": ["كريم"]}])
c("split", "fr", "2asem 1000 3alaya w 3ala hassan w karim", "franco", actions=[{"kind": "split_bill", "amount": 1000, "people_all": ["Hassan", "Karim"]}])
# ---------- today / memory / settings ----------
c("today", "en-open", "open today", "english", actions=[{"kind": "open_screen", "screen": "today"}])
c("today", "fr-what", "3andy eh bokra?", "franco", open_items=[OI(40, "Meeting", "2026-11-20T12:00")])
c("memory", "en-son", "Omar is my son, he's 11", "english", mem=["omar"])
c("memory", "ar-allergy", "عمر عنده حساسية من البيض", "arabic", mem=["حساسية", "بيض"])
c("memory", "fr-sleep", "bnam el sa3a 1 dlw2ty 3adelha", "franco", actions=[{"kind": "settings", "setting": "sleep_time", "text_any": ["01:00"]}])
# ---------- must NOT act ----------
c("chat", "en-movie", "watched a great movie last night", "english")
c("chat", "ar-tired", "الشغل النهارده كان صعب أوي", "arabic")
c("chat", "fr-match", "el ahly hayel3ab bokra el sa3a 8, metfa2el", "franco")
c("chat", "en-q", "what should I cook tonight?", "english")
c("chat", "ar-price", "الطماطم بقت بـ ٣٠ جنيه", "arabic")
c("chat", "fr-love", "enta gamed ya zaki", "franco")
c("chat", "ar-crisis", "مش قادر أكمل وعايز أنهي حياتي", "arabic", crisis=True)

path = os.path.join(os.path.dirname(__file__), "holdout3.jsonl")
with open(path, "w") as f:
    for x in cases: f.write(json.dumps(x, ensure_ascii=False) + "\n")
print(len(cases), "cases")
