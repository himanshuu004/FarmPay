# Getting Started with Claude Code — a non-programmer's guide
*(Allied KCC project · July 2026)*

## What you're about to do
Claude Code is Claude running inside your Mac's **Terminal** — a text window where you type instructions. Unlike this chat, it sits directly on your project folder: it can create the codebase, run it, test it, and fix it. You direct; it builds. You never need to write code yourself — you need to read plans, ask questions, and say yes or no.

---

## Part A — One-time setup (~15 minutes)

**Step 1. Open Terminal.**
Press `Cmd + Space`, type `Terminal`, press Enter. A plain text window opens. That's it — commands are typed here and run when you press Enter.

**Step 2. Install Claude Code.**
Copy this line, paste it into Terminal, press Enter:
```
curl -fsSL https://claude.ai/install.sh | bash
```
It downloads and installs automatically (no other software needed). When it finishes, **close Terminal and open it again** (so it learns the new command).

**Step 3. Check it worked.**
```
claude --version
```
If you see a version number, you're done. If something looks wrong, run `claude doctor` and it will diagnose itself.

**Step 4. Sign in.**
```
claude
```
Your browser opens — log in with the same Claude account you use here (needs a Pro or Max plan). One-time only. Type `exit` or press `Ctrl+C` twice to leave.

---

## Part B — Starting the project (every work session begins like this)

**Step 5. Go to the project folder.**
```
cd ~/Dairy_kcc
```
(`cd` = "change directory" — you're telling Terminal which folder to work in. `~/Dairy_kcc` is the folder with the blueprint, CLAUDE.md, and the diagram.)

**Step 6. Launch Claude Code with access to the two old codebases** (it will copy code from them):
```
claude --add-dir ~/Desktop/farmerpay-platform --add-dir ~/farmer_pay_projects/farmerpay-platform/dairy_cooperative
```
Tip: save this line in your Notes app — it's your standard "start work" command.

**Step 7. It reads the rules automatically.**
Claude Code auto-loads `CLAUDE.md` from the folder — every design decision we made (the KCC math, the 70% rule, no passwords, offline-first, all of it) is already in its head. You don't need to re-explain anything.

---

## Part C — Your first working session

**Step 8. Ask for a plan before any code.** Paste this as your first message:
```
Read CLAUDE.md and DAIRY-KCC-BLUEPRINT.md fully. We are starting Phase 0
(extraction) as defined in the blueprint. Propose a step-by-step plan for
Phase 0 only — what you will copy, from where, and in what order. Do not
write any code until I approve the plan. Explain the plan in plain language,
I am not a programmer.
```

**Step 9. Approve as you go.**
Claude Code asks permission before running commands or editing files — you'll see prompts like "Allow? (y/n)". Press `y` (or Enter) to allow. Read what it wants to do; if unsure, ask "explain what this command does in plain words" before approving.

**Step 10. Create save points.** After the plan is approved, send:
```
Initialize git in this folder and make a commit after every completed,
working step with a clear message.
```
Git = save points. Every commit is a snapshot you can return to, so nothing is ever truly broken. If things go wrong later: "restore the last working commit."

---

## Part D — Working rhythm (weeks ahead)

- **One phase at a time**, in blueprint order: Phase 0 (extraction) → Phase 1 (COOP passbook — the wedge) → Phase 2 (KCC) → Phase 3 (insurance). Never let it jump ahead.
- **End every step with proof:** "run the tests and show me the result" / "start the app and tell me how to see it on my phone."
- **When it needs software** (PostgreSQL, Redis etc.), just say: "install and set up whatever you need, explain what each thing is in one line."
- **When you're lost:** "What is the current status? What did we finish, what's next?" — it will summarize.
- **New session?** Just repeat Part B. It re-reads CLAUDE.md; ask "summarize where we left off" (or use `claude --continue` to resume the last conversation).
- **Useful commands inside Claude Code:** `/help` (all commands), `/clear` (fresh start between big tasks), `Shift+Tab` (toggle plan mode — it plans without touching files).
- **Come back to Cowork (this chat)** for design thinking, document updates, stakeholder material, or contract reviews — then carry decisions into CLAUDE.md so Claude Code follows them.

## Comfort notes
- You cannot easily break anything: it asks before acting, and git gives you undo.
- You are the product owner; it is the engineering team. Your job is exactly what you did in the design phase — decide, question, verify. "Explain like I'm not a programmer" is always a fair instruction.
- Budget expectation: Phase 0 is many sessions, not one. Judge progress by the blueprint's exit criteria, not by lines of code.
