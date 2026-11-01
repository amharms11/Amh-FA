# Booking HQ

A phone-first app for running a cleaning **booking** business, where you're the middleman: leads come in, customers book and pay online, you text the job to your cleaners, and you keep the spread.

Like AMH Finance, it's a plain HTML/CSS/JS web app with **no server and no accounts**. Your data stays in your browser on your device.

## What it does
| Step | In the app |
|---|---|
| 1. A lead comes in (Thumbtack, Google, Nextdoor, Facebook…) | **Leads → +**: log the name, phone, home size, the clean they want and **what the lead cost you**. You see the price and what you'll keep right away. |
| 2. Reply right away | The app writes the quote reply with a **quote link** (copy it, or tap Text). Paste the customer's question into **Draft a reply** and you get an answer built from your FAQ, or from Claude if you add an API key. |
| 3. They book and pay | **They booked** turns the lead into a client and a job. Recurring discounts are built in. In the default pricing, a 2 bed / 2 bath clean every 2 weeks is $180 − $30 = **$150**. |
| 4. Text the job to your cleaners | The job screen has the offer ready: *"New job: 412 Oak St, Tue, Nov 3 at 9:00 am. 2bd/2ba standard clean. Your pay $112.50. First to reply YES gets it."* Text each ready cleaner with one tap, or copy all their numbers for a group text. Tap whoever claimed it and the confirmation texts are ready. |
| 5. Keep the spread | **Home** shows what customers paid, cleaner pay, card fees, lead costs, refunds and expenses, then **what you kept**, with progress toward your monthly goal and about how many jobs it will take. |

Also included:
- **Recurring clients**: when you mark a job done, the next visit is scheduled automatically with the same cleaner. A first deep clean switches to standard pricing for the visits after it.
- **Customer quote page** (`quote.html`): customers choose bedrooms, bathrooms, type of clean, how often, and extras, see the price live, then tap **Book & pay online** (your Stripe or Square link) or **Text us to book**.
- **Cleaners**: tracks the signed contractor + non-solicit agreement, W-9, background check, ratings, complaints, what you owe each cleaner, and pay so far this year. It flags anyone who will need a 1099-NEC. Cleaners with missing paperwork don't get job offers.
- **Complaints**: log what went wrong, schedule a free re-clean in one tap, track refunds, and see complaints per cleaner.
- **Lead sources**: leads, bookings, spend, cost per booking, and profit for each source, so you can tell whether Thumbtack is paying off compared with the free sources.
- **Messages & FAQ**: every text template and FAQ answer can be edited. Copy them into your AI texting tool so its answers match your prices.
- **Contractor + non-solicit agreement**: a plain-language starting draft. Have a local attorney review it.
- **Startup checklist**: LLC, EIN, insurance, payments, agreements, Google Business Profile, Nextdoor, Facebook and more.
- Expenses, JSON backup and restore, CSV export of jobs, sample data, light and dark mode, and it works offline.

## Run it
```bash
cd booking
python3 -m http.server 8000   # then open http://localhost:8000
```
Tap **Or explore with sample data** on the first screen to try it out.

## Put it on your phone, and make quote links work for customers
Customers can only open the quote link if the app is hosted on a public HTTPS address. With GitHub Pages turned on for this repo (Settings → Pages → deploy from branch `main`), the app is at `https://amharms11.github.io/Amh-FA/booking/`. Open that address in Safari, tap Share → **Add to Home Screen**, and quote links will use it automatically.

## AI reply drafts (optional)
In **More → Settings**, add an Anthropic API key. **Draft a reply** then asks Claude to answer the customer using only your prices and FAQ. Without a key, the app matches the question to your FAQ. The key is stored only in this browser. When you tap Draft, the customer's message and your business info are sent to Anthropic.

This app doesn't send texts on its own: Text buttons open your phone's messaging app with the message already filled in. To reply to leads automatically around the clock, use an AI texting or booking tool and paste in this app's templates and FAQ.
