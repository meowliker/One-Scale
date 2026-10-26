# Reading Our Product Data

The media buyer maintains one .md file per product, ideally in the template at `assets/product-data-template.md`. Usually it sits in the Claude Project's knowledge for that product, so every strategist chat inside the Project can read it. It may also be uploaded straight into the chat.

## Find it

1. Check the Project knowledge and the chat's files for a product .md (name contains the product, or headings like "Winner", "Angles", "Customer language").
2. If several products' files are present, use the one the strategist named. If it's unclear, ask.
3. Note the file's "Last updated" date. If it's more than ~30 days old, add a one-line warning at the top of your options ("Data file is from [date]. Winners may have changed.").

## What to pull for each run

Build this short **data card** for yourself (show it to the strategist in 5–8 lines at the top of the options message, so they can see what you're working from):

```
DATA CARD: [Product]
Winner(s):        [ad name] | [key metrics] | angle: [..] | hook: "[..]"
Working angles:   [angle → why / numbers]
Failed angles:    [angle → what happened]  ← don't recycle these without saying so
Best hooks:       "[..]" ([hook rate]), "[..]"
Buyer:            [age / gender / persona, who actually buys]
Pains / desires:  [top 3 each, in customer words if available]
Customer words:   "[exact phrase]", "[exact phrase]"
Offer / CTA:      [offer, price framing, standard CTA]
Proof we can use: [reviews count, numbers, credentials, results]
Can't say:        [banned claims / words]
```

## How to use it

- **Winner first.** The current winner shows the angle and voice that convert for us right now. When a strategist adapts an inspiration, the default is: the inspiration's shape plus the winner's angle and voice, unless they say they want to test a new angle.
- **Hook rate vs. results.** A hook with a high hook rate but a poor CPA/ROAS stops the scroll but attracts the wrong people. Tell the strategist when you use one ("strong stop rate, weak conversion; pair with a qualifying bridge"). Good conversion with a low hook rate means the body works and the hook needs a fix.
- **Failed angles.** If an option revisits an angle the file lists as failed, label it `⚠️ previously failed: [reason]` so the strategist decides with eyes open.
- **Customer words beat marketing words.** Use the exact phrases buyers use in reviews and comments for hooks and pains. They sound native and they're proven.
- **Buyer ≠ assumed audience.** Write for who actually buys (from the data), not who the competitor targets.

## When data is missing

| Missing | Do |
|---|---|
| Whole file | Tell the strategist. Offer to continue using the product page (if a URL is given) and their notes, and mark all options `⚠️ not data-backed`. Suggest the media buyer fills `assets/product-data-template.md`. |
| Winner section | Ask the strategist which ad is the current winner, or continue angle-neutral. |
| Banned claims | Use common sense for the category (no medical cures, no guaranteed income, no before/after body claims) and ask the strategist to confirm. |
| Proof numbers | Use `[NEED: proof]` placeholders, never invented numbers. |

Never fill a gap with made-up metrics, review counts, or testimonials.
