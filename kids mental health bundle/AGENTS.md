# Project instructions

This folder is the workspace for the kids mental health bundle project.

## Working together

- Keep project files and deliverables in this folder.
- Read existing materials before making changes.
- Follow the user's current brief and ask for clarification when essential details are missing.
- Use clear, age-appropriate language in materials intended for children, and identify the intended age group when relevant.
- Avoid unsupported mental health claims or presenting educational materials as diagnosis or treatment.
- Do not publish, send, or share materials externally unless the user requests it.

## Deliverables

- Whenever a deliverable is saved as a Markdown file, also export a PDF of it with the same name next to it (for example `report.md` → `report.pdf`), and give the user the PDF.
- Also put the key data in the chat reply, so the user can read the findings without opening a file.

## Shared agent instructions

Keep shared project instructions in this file so Codex and Claude use the same guidance. The root `CLAUDE.md` imports this file.

## Skills

Project skills live in two mirrored folders: `.agents/skills/` (read by Codex) and `.claude/skills/` (read by Claude). Keep both copies identical; when a skill changes, update it in both places.

- `inspiration-breakdown` (Skill 1): analyzes a reference video ad into a timecoded breakdown and Reference Rules Sheet.
- `data-informed-adaptation` (Skill 2): uses product-scoped Meta Ads data, audience research, and the Skill 1 breakdown to write 5 ranked ad variations.
- `storyboard-approval` (Skill 3): turns the chosen Skill 2 variation into a shot-by-shot storyboard with review keyframes, audio previews, generation prompts, and an approval package. It refers to `assets/approval-package-template.md`, which is not included yet; until it is added, use the package sections described in the skill itself.

## Workflow files

- Skill 1 outputs: `inspiration-breakdowns/` (for example `INS-20785b5fa6bd-breakdown.md`).
- Skill 2 outputs: `adaptations/` (for example `INS-20785b5fa6bd-KMH-adaptation.md`). Skill 2 itself only prints tables in chat; save a copy here so Skill 3 can read it.
- Skill 3 outputs: `storyboards/`.
