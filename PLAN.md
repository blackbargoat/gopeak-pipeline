# GoPeak content plan (pipeline)

Researched 2026-11-15 from GoPeak's own numbers (Supabase, App Store sales, reply-bot stats), the 16 GoTall outliers in HQ, and public write-ups of GoTall's growth.

## What the numbers say

| | |
|---|---|
| Best GoPeak videos | "Flex your height with your age 🟢 Tall 🔵 Potential 🔴 Cooked, comment below": 218K, 159K, 155K, 74K views |
| Their comment rate | 33–79 comments per 1K views (other posts: 0–16) |
| Downloads | ~27–32/day Nov 7–11, then 10–11/day |
| Trials | 0–2/day → **~3–5% of downloads start a trial** (the leak) |
| Waitlist | ~4.9 signups per 1K IG views |

Comments are the engine: the reply bot answers every "13, 5'6" with a prediction and "app in bio". So the format that makes people comment is the one that makes downloads.

The weak spot is after the download: 3–5% download→trial is low for a hard-paywall app with a free trial (GoTall reports a 91% paywall show rate on a 47-screen onboarding). The dev's onboarding analytics (`hq_app_stats`) will show where people quit; until then, two content-side fixes:
- **Match the promise to the app.** "Free height prediction" sends people in expecting a free number and they hit a paywall. Show the GoPeak result screen in the video and say "your full prediction" instead of "free".
- **Show the app before the download.** App-reveal videos end on the real GoPeak result screen, so the people who tap already know what they get.

## The mix (per account per day: 3 trial reels)

| Format | Share | What | Why |
|---|---|---|---|
| 💬 comment bait | 40% | Deadpan face + "Flex your height with your age" legend + "comment below" | Mav's proven winner; comments → reply bot → installs |
| 📱 app reveal | 35% | GoTall outlier remakes that cut to the GoPeak result screen ("if you're 12…", "would you rather", "are you cooked?") | Proven outliers (200K–880K) + shows the app as the payoff |
| 🎬 remake | 25% | GoTall outliers with text only ("signs you're genetically taller", "short mom nerf") | Reach; feeds the comment engine |

Each clip of Mav: 4 uses max, 2 per account, every use a different text + audio. Per clip: each account gets one comment-bait + one remake.

Next formats to add (need new footage or the app):
- **Reply-to-comment videos** (GoTall's founder's original format): reply to a real comment ("13, 5'4, how tall will I be?") with that person's prediction on the GoPeak screen. Uses TikTok's reply-with-video; one comment → one video → more comments.
- **App screen recording as the payoff**, not the whole video: 2–3 s of face hook, then a 4–6 s screen recording of typing age/height → prediction ring. A vendor comparison ranks a standalone screen recording well below creator-style video for installs (unverified), so always lead with a face.

## Posting rules
- 3 slots/day/account (11:00, 16:00, 20:30 ET), Instagram as trial reels first; graduate winners to the feed by hand.
- TikTok: send to drafts and add the reference's sound in-app (counts toward the trend).
- Same clip never posts on both accounts the same day; same account reuses a clip ≥ 2 days apart.

## GoTall's playbook (for reference)
- Found demand from teens asking for predictions in comments; answered with reply videos.
- Founder posted ~10 TikToks/day for a month, found the winner, copied it on 3 accounts, then DM'd ~50 creators/day and paid ~$5/video to replicate it; best organic videos became paid ads.
- 47-screen onboarding, result locked behind the paywall, $35/yr or $5/wk; reported ~$30K/mo (Nov 2025) → ~$150K/mo (Jan 2026); a Superwall-linked snapshot shows $60.4K MRR (Aug 2026).

Sources: [Yuma Ueno](https://yumaueno.substack.com/p/this-20-year-old-grew-a-height-prediction), [Stork](https://www.stork.ai/blog/the-100kmonth-tiktok-app-idea), [SoFarBot](https://www.sofarbot.com/stories/gotall-michael-100000-monthly-ai-height-app), [Collab Only](https://collabonly.com/blog/posts/ugc-vs-professional-app-demo-video/) (vendor, unverified), [socialz.ai on reply videos](https://socialz.ai/blog/how-to-reply-to-a-comment-with-a-video-on-tiktok).

## Instagram research, 2026-11-15 (#gotall, #heightprediction, #howtallwillibe; logged-out public pages + yt-dlp)
| Likes | Comments | Account | Format |
|---|---|---|---|
| 294K | 22K | @elevatemethods | Animated explainer: stick figures + height bars, "How is he 6'1 at 16 (mom 5'6, dad 5'10)?", Michael Jordan example, ends "comment your age / send to the friend who's taller than his dad". 54 s, faceless |
| 35K / 19K | 1.5K / 2.4K | @platecheck0 | Same animated style ("all his friends are taller at 15… but his genes say different") |
| 27K | 4.5K | @tallmax.app | Static "Average height by age" chart (boys / girls 12–20) + app CTA, 8 s |
| 441K views | 2.8K | @gotall.app | "If you are 5'8 at 15… You MIGHT be COOKED" + app ring card in the corner; caption "Send this to your short friend" |
| 4.1M views | 118 | creator for @gotall.app | Skit: friends with cm labels → app exercise screen → doing it → labels grow to 190cm |
| 3.7K | 21K | @mav.tallteen | "Flex your height with your age" (ours; #2 comments in the hashtag) |

Built from this: c1 (cooked + corner card), c2 (bold claim + card), t1 (CDC height-by-age chart, real data from the app). Next: animated explainer (motion graphics).
