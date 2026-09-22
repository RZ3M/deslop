// Hand-written sample posts with the verdict we expect at "balanced" strictness.
// `expect` is 'keep' or the id of a category that should hide the post
// (any hit category counts as a pass for a 'hide' expectation).

export const FIXTURES = [
  // ── Engagement bait ────────────────────────────────────────────────
  {
    expect: 'engagement_bait',
    post: {
      platform: 'x',
      author: { name: 'Growth Guru', handle: '@growthguru' },
      text: 'I found a Claude prompt that writes a month of content in 10 minutes.\n\nThe prompt is in the replies 👇',
    },
  },
  {
    expect: 'engagement_bait',
    post: {
      platform: 'linkedin',
      author: { name: 'Priya S.', headline: 'AI Educator | 200K followers' },
      text: "I built a 47-page Notion guide to landing a job in tech.\n\nIt's 100% free.\n\nWant it?\n\n1. Connect with me\n2. Comment 'GUIDE' below\n\nI'll send it straight to your DMs 📩",
    },
  },
  {
    expect: 'engagement_bait',
    post: {
      platform: 'x',
      author: { name: 'Crypto Daily', handle: '@cryptodaily' },
      text: 'What happened at 3:14 AM last night changed crypto forever.\n\nMost people have no idea.\n\nA thread 🧵👇',
    },
  },
  {
    expect: 'engagement_bait',
    post: {
      platform: 'x',
      author: { name: 'Mindset Daily', handle: '@mindsetdaily' },
      text: 'Would you take $1M today or $10K every month for life?\n\nReply with your answer 👇 Like if you picked the first one.',
    },
  },

  // ── AI-generated writing ───────────────────────────────────────────
  {
    expect: 'ai_generated',
    post: {
      platform: 'linkedin',
      author: { name: 'Mark T.', headline: 'Helping founders scale | Keynote speaker' },
      text: "In today's fast-paced digital landscape, leadership isn't about having all the answers — it's about asking the right questions.\n\n🚀 Embrace uncertainty\n💡 Foster a culture of curiosity\n🤝 Empower your team to take ownership\n✅ Celebrate progress, not perfection\n\nThe leaders who thrive tomorrow are the ones who are willing to learn today.\n\nWhat's one lesson that shaped your leadership journey? 👇\n\n#Leadership #Growth #Innovation",
    },
  },
  {
    expect: 'ai_generated',
    post: {
      platform: 'x',
      author: { name: 'AI Insider', handle: '@ai_insider' },
      text: "Here's the thing about AI agents:\n\nIt's not about replacing humans.\nIt's about amplifying them.\n\nThe companies that understand this will unlock unprecedented value.\nThe ones that don't will be left behind.\n\nLet that sink in.",
    },
  },
  {
    expect: 'ai_generated',
    post: {
      platform: 'linkedin',
      author: { name: 'Jordan Blake', headline: 'Product Manager' },
      text: "Delving into the world of product management has taught me invaluable lessons. It's a journey of continuous learning, where every challenge is an opportunity for growth. By fostering collaboration and embracing a customer-centric mindset, we can navigate the ever-evolving landscape and deliver meaningful impact. Excited to see what the future holds! #ProductManagement #Growth",
    },
  },

  // ── Recycled news ─────────────────────────────────────────────────
  {
    expect: 'news_rehash',
    post: {
      platform: 'x',
      author: { name: 'AI Daily Brief', handle: '@aidailybrief' },
      text: "AI news you missed this week 🧵\n\n1. OpenAI released a new reasoning model\n2. Google updated Gemini with longer context\n3. Anthropic shipped a new Claude model\n4. Meta open-sourced another Llama\n\nFollow for more daily AI updates.",
    },
  },
  {
    expect: 'news_rehash',
    post: {
      platform: 'linkedin',
      author: { name: 'Samantha R.', headline: 'Tech enthusiast | Future of work' },
      text: "Big news: Apple just announced its new AI features at WWDC two weeks ago.\n\nHere's what it means for your business:\n\n→ Siri is getting smarter\n→ Privacy is still a priority\n→ Developers get new APIs\n\nThe future is here. Are you ready?",
    },
  },

  // ── Clickbait ─────────────────────────────────────────────────────
  {
    expect: 'clickbait',
    post: {
      platform: 'x',
      author: { name: 'Tech Hype', handle: '@techhype' },
      text: 'RIP Photoshop.\n\nThis new free AI tool just changed design forever and 99% of designers have no idea it exists.',
    },
  },

  // ── Broetry / humblebrag ──────────────────────────────────────────
  {
    expect: 'hollow_inspiration',
    post: {
      platform: 'linkedin',
      author: { name: 'Chad W.', headline: 'CEO | Founder | Dad' },
      text: "Yesterday I fired my best salesperson.\n\nHe hit 200% of quota.\n\nHe was loved by clients.\n\nBut he was toxic to the team.\n\nCulture eats strategy for breakfast.\n\nI'd make the same call again tomorrow.\n\nAgree?",
    },
  },
  {
    expect: 'hollow_inspiration',
    post: {
      platform: 'linkedin',
      author: { name: 'Daniel K.', headline: 'VP Sales' },
      text: "My 6-year-old daughter taught me more about negotiation than my MBA did.\n\nShe wanted ice cream.\n\nI said no.\n\nShe didn't argue. She asked a question.\n\n\"Daddy, what would make it a yes?\"\n\nThat's sales.",
    },
  },

  // ── Genuine posts that must be kept ───────────────────────────────
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Devon Park', handle: '@devonpark' },
      text: 'Model X 2.1 was a great default for the price: fast, reliable, cheap.\n\nX 2.2 feels like a step backwards to me. Slower, pricier, and it burns far more tokens for roughly the same scores on my evals.',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'jeff', handle: '@jeff_beats' },
      text: 'this album has been on repeat all week',
      media: 'video',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Rosa Lind', handle: '@rosalind_ops' },
      text: "spent all afternoon debugging why our DNS lookups were slow and it turned out glibc was trying IPv6 first and waiting 5 seconds for each timeout. setting 'options single-request' in resolv.conf fixed it",
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'linkedin',
      author: { name: 'Aru K.', headline: 'cs student' },
      text: "I've used a little tool I built called Stash every day for months now, and it's the most useful thing I've made for myself.\n\nIt started with a simple problem: I kept losing track of links and notes across my phone and laptop. So I wrote a small Rust server with SQLite and a Chrome extension that saves whatever I'm reading with one shortcut. Search is just FTS5. Repo is public if anyone wants to poke at it.",
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'linkedin',
      author: { name: 'Northwind Labs', headline: 'Company' },
      text: 'We are hiring 2026 summer interns in Toronto for software, data and product roles. Applications close October 15. Roles, locations and pay ranges are listed on our careers site.',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'DB Weekly', handle: '@dbweekly_news' },
      text: 'Postgres 18 is out. Headline features: async I/O for sequential scans, virtual generated columns, and uuidv7(). Full release notes: postgresql.org/docs/18/release-18.html',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Nina', handle: '@nina_writes_code' },
      text: 'ok hot take but tabs vs spaces discourse is the most fun you can have on here. anyway my team uses 2 spaces and i will die on this hill lol',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'linkedin',
      author: { name: 'Maria Gonzalez', headline: 'Staff Engineer at Contoso' },
      text: 'After 6 years at Contoso, Friday is my last day. I worked on checkout performance, the Ruby YJIT rollout, and mentored 11 interns. Taking a month off, then joining a small team working on developer tooling. Thank you to everyone who reviewed my very long PRs.',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Sam W.', handle: '@samw_blog' },
      text: 'I tried the new model on my standard pelican-on-a-bicycle SVG test. It drew the bicycle correctly for the first time but the pelican has three legs. Notes and all the SVGs here: example.com/pelican-test',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Northwind News', handle: '@northwindnews' },
      text: 'Canadian inflation cooled to 1.9% in August from 2.4% in July, Statistics Canada said on Tuesday, below analyst expectations of 2.1%.',
    },
  },

  // ── Harder cases ──────────────────────────────────────────────────
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Mika', handle: '@mika_builds' },
      text: '1/ We moved our CI from 40 minute runs to 6 minutes. The biggest win was not caching, it was splitting the monorepo test graph so unrelated packages stop rebuilding. Details on what worked and what did not below.',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'linkedin',
      author: { name: 'Kevin L.', headline: 'Software Engineer' },
      text: "I'm happy to share that I'm starting a new position as Software Engineer II at Contoso!",
    },
  },
  {
    expect: 'ai_generated',
    post: {
      platform: 'x',
      author: { name: 'Olivia Growth', handle: '@olivia_growth_ai' },
      text: "Great insight! This really highlights the importance of adaptability in today's rapidly evolving landscape. Thanks for sharing such a valuable perspective! 🚀",
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'friday deploys', handle: '@fridaydeploys' },
      text: 'me after pushing to prod on a friday at 4:59pm',
      media: 'image',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'linkedin',
      author: { name: 'Hannah Moore', headline: 'Owner, Moore Bread Co.' },
      text: 'Ten years of running a bakery, a few things I did not expect:\n1. Flour was never the big cost. Rent and the walk-in cooler repair bills were.\n2. Our best seller (cardamom buns) started as a staff snack.\n3. Closing Mondays improved sales on every other day.\n4. The oven guy is the most important phone number you have.',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Carlos Méndez', handle: '@cmendez' },
      text: 'Hoy terminé de migrar nuestra app de React Native a Expo SDK 54. Lo más difícil fue actualizar las notificaciones push; el resto fue bastante tranquilo.',
    },
  },
  {
    expect: 'ai_generated',
    post: {
      platform: 'linkedin',
      author: { name: 'Elena Petrova', headline: 'Digital Transformation Leader' },
      text: "AI won't replace you.\n\nBut someone using AI will.\n\nHere's how to stay ahead:\n\n✅ Embrace lifelong learning\n✅ Leverage AI tools to amplify your impact\n✅ Focus on uniquely human skills like empathy and creativity\n✅ Build a strong personal brand\n\nThe future belongs to those who adapt.\n\n♻️ Repost if this resonates\n➕ Follow me for more insights",
    },
  },
  {
    expect: 'engagement_bait',
    post: {
      platform: 'x',
      author: { name: 'Viral Clips', handle: '@viralclips' },
      text: 'Wait for the end… 😳',
      media: 'video',
    },
  },

  // ── Real-feed shapes: short reactions to a quoted post ────────────
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'online engineer', handle: '@online_engineer' },
      text: 'this is gonna one shot my wife',
      quoted: { author: '@gamenews', text: 'Serious dress crafting sim "Dressmaker", where you handle everything from fabric selection to cutting and sewing, is now out on Steam!' },
      media: 'video',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Lena R.', handle: '@lena_pm' },
      text: 'Hug your engineer',
      quoted: { author: '@burnt_out_dev', text: 'The state of engineering right now is horrible. Two weeks into a new role at a big company and nobody knows anything.' },
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Ken C.', handle: '@kenc_dev' },
      text: 'psa: a huge uncached prompt can cost you several dollars per request. that adds up fast even on a subscription plan. turn on prompt caching.',
    },
  },
];
