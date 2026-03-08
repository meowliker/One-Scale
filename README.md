## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality Checks

Use the full parallel quality gate before pushing:

```bash
npm run check:parallel
```

What it does:
- Runs `lint`, `typecheck`, and `test` in parallel.
- If all pass, runs `build`.

Useful commands:

```bash
npm run lint
npm run lint:fix
npm run typecheck
npm run test
npm run test:creative-load
npm run build
npm run check
```

`npm run check` is the sequential version of the full gate.
`npm run test` auto-skips when `TEST_STORE_ID` is not set.

## Workflow: Bugs and Features

1. Create a short plan before coding.
2. Implement in small commits by area.
3. Run targeted checks while coding.
4. Run `npm run check:parallel` before PR/deploy.
5. Open PR with risk notes and test evidence.

### Bug Fix Flow

1. Reproduce and isolate:
```bash
npm run dev
```
2. Add logging or a minimal failing case.
3. Fix the smallest root cause first.
4. Re-run checks:
```bash
npm run lint && npm run typecheck && npm run test
```
5. Run full gate:
```bash
npm run check:parallel
```

### New Feature Flow

1. Write a one-page mini spec:
- Problem
- User impact
- Scope / out of scope
- API/data changes
- Test plan

2. Build in thin slices:
- Data/service layer
- UI layer
- Edge cases and errors

3. Validate:
- Happy path
- Empty/loading/error states
- Regression on related pages

4. Final gate:
```bash
npm run check:parallel
```

## Planning and Idea Backlog

Use `docs/plans/` for feature thinking. For each idea, keep:
- Goal
- Success metrics
- Constraints
- Milestones
- Risks
- Kill criteria (when to stop)

Templates:
- `docs/plans/feature-template.md`
- `docs/plans/bug-fix-template.md`
