// Hand-written sample posts with the verdict we expect at "balanced" strictness.
// `expect` is 'keep' or the id of a category that should hide the post
// (any hit category counts as a pass for a 'hide' expectation). The harness
// runs each post with the default categories plus the expected one, so
// off-by-default categories are tested too.

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

  // ── Hate & toxicity (the vile part is often in the quoted post) ──
  {
    expect: 'hate_speech',
    post: {
      platform: 'x',
      author: { name: 'quote guy', handle: '@quote_reactor' },
      text: '"As a rapist"',
      quoted: { author: '@edgy_account', text: "As a rapist, I get turned off when a girl likes rape because it's not rape if you want it retard." },
      media: 'video',
    },
  },
  {
    expect: 'hostile',
    post: {
      platform: 'x',
      author: { name: 'anon', handle: '@anon88213' },
      text: 'Shut up you braindead loser. Nobody asked. I hope someone finds out where you live.',
    },
  },
  {
    expect: 'hate_speech',
    post: {
      platform: 'x',
      author: { name: 'Patriota', handle: '@patriota_1488' },
      text: 'Los inmigrantes son una plaga. Hay que echarlos a todos antes de que nos reemplacen.',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Northwind News', handle: '@northwindnews' },
      text: 'Police arrested a man for spray-painting antisemitic graffiti on a synagogue in Lyon, prosecutors said on Tuesday.',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'maya', handle: '@maya_k' },
      text: 'if anyone spoils the finale before i watch it tonight i will end you 😭',
    },
  },

  // ── Same slop, other languages ────────────────────────────────────
  {
    expect: 'engagement_bait',
    post: {
      platform: 'linkedin',
      author: { name: 'Lucía M.', headline: 'Coach de carrera | 150K seguidores' },
      text: "Hice una guía gratis de 40 páginas para conseguir trabajo en tech.\n\n¿La quieres?\n\n1. Sígueme\n2. Comenta 'GUÍA'\n\nY te la mando por DM 📩",
    },
  },
  {
    expect: 'engagement_bait',
    post: {
      platform: 'x',
      author: { name: '增长黑客', handle: '@growth_cn' },
      text: '我找到了一个能10分钟写完一个月内容的提示词。\n\n提示词在评论区👇',
    },
  },
  {
    expect: 'ai_generated',
    post: {
      platform: 'linkedin',
      author: { name: 'Rafael S.', headline: 'Líder de Transformação Digital' },
      text: 'No cenário atual, em constante evolução, liderar não é ter todas as respostas — é fazer as perguntas certas.\n\n🚀 Abrace a incerteza\n💡 Cultive a curiosidade\n🤝 Empodere sua equipe\n✅ Celebre o progresso, não a perfeição\n\nOs líderes que prosperam amanhã são os que aprendem hoje.\n\n#Liderança #Inovação',
    },
  },
  {
    expect: 'clickbait',
    post: {
      platform: 'x',
      author: { name: 'AIテック速報', handle: '@ai_tech_jp' },
      text: 'Photoshop、終わりました。\n\nこの無料AIツールがデザインを永遠に変えた。99%のデザイナーはまだ知らない。',
    },
  },
  {
    expect: 'news_rehash',
    post: {
      platform: 'x',
      author: { name: 'IA Quotidienne', handle: '@ia_quotidienne' },
      text: "🚨 OpenAI vient de lâcher un nouveau modèle. Voici tout ce que vous devez savoir 🧵\n\n1. Il est plus rapide\n2. Il est moins cher\n3. Il change tout\n\nAbonnez-vous pour plus d'actus IA.",
    },
  },
  {
    expect: 'hollow_inspiration',
    post: {
      platform: 'linkedin',
      author: { name: 'Jonas B.', headline: 'CEO | Gründer | Vater' },
      text: 'Gestern habe ich meinen besten Vertriebler entlassen.\n\nEr hat 200 % seiner Quote erreicht.\n\nDie Kunden liebten ihn.\n\nAber er war toxisch fürs Team.\n\nKultur schlägt Strategie.\n\nIch würde es wieder tun.\n\nZustimmung?',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: '佐藤', handle: '@sato_dev' },
      text: '今日はRustでCLIツールを書き直した。起動時間が120msから8msになって嬉しい。',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'x',
      author: { name: 'Omar', handle: '@omar_builds' },
      text: 'أطلقنا اليوم الإصدار الثاني من تطبيقنا. أصبح البحث أسرع بثلاث مرات بفضل الفهرسة الجديدة.',
    },
  },
  {
    expect: 'keep',
    post: {
      platform: 'linkedin',
      author: { name: 'Ananya R.', headline: 'Frontend Engineer' },
      text: 'आज हमने अपने ऐप में डार्क मोड जोड़ा। इसमें तीन दिन लगे क्योंकि हमारे CSS वेरिएबल्स गड़बड़ थे।',
    },
  },

  // ── Off-by-default filters ────────────────────────────────────────
  {
    expect: 'get_rich_quick',
    post: {
      platform: 'x',
      author: { name: 'Passive Pete', handle: '@passivepete' },
      text: "I make $30k/month from home with this one AI side hustle. No experience needed. Here's how 👇",
    },
  },
  {
    expect: 'self_promotion',
    post: {
      platform: 'linkedin',
      author: { name: 'Brad K.', headline: 'I help coaches hit $50K months' },
      text: "My cohort on AI automation opens tomorrow.\n\nOnly 20 spots left.\n\nDM me 'IN' to grab yours 🚀",
    },
  },
  {
    expect: 'politics',
    post: {
      platform: 'x',
      author: { name: 'Capitol Watch', handle: '@capitolwatch' },
      text: 'The Senate passed the budget bill 51-49 tonight after an all-night session. The House votes on Thursday.',
    },
  },
  {
    expect: 'sexual',
    post: {
      platform: 'x',
      author: { name: 'Jessica 💋', handle: '@jess_x9921' },
      text: "🔞 new uncensored video in my bio 💦 don't tell anyone 😘",
    },
  },

  // ── LinkedInfluencers and fancy fonts ─────────────────────────────
  // Adapted from a real post, with names and details changed. Fancy fonts but
  // no emojis, so it's for the LinkedInfluencer question, not the font check.
  {
    expect: 'linkedinfluencer',
    post: {
      platform: 'linkedin',
      author: { name: 'Mia L.', headline: 'founder @ tally | cs @ state u' },
      text: "𝐢 𝐣𝐮𝐬𝐭 𝐬𝐩𝐞𝐧𝐭 2 𝐰𝐞𝐞𝐤𝐬 𝐨𝐧 𝐚 𝐫𝐞𝐚𝐥𝐢𝐭𝐲 𝐬𝐡𝐨𝐰 𝐜𝐨𝐦𝐩𝐞𝐭𝐢𝐧𝐠 𝐟𝐨𝐫 $100,000.\nthere's a lot to unpack.\n\nfirst, you need to understand how our days felt at the accelerator...\n\nit's 8:55 am and i'm running toward a barn for stand-up. the autumn air is stinging my face and, as usual, i've missed breakfast.\n\nover those two weeks, my cofounder and i:\n- did our first sales calls\n- turned our waitlist into paying users\n- launched publicly\n- heard from two famous investors\n\nelimination nights were tense. we'd gather around a bonfire as our rankings were revealed one by one.\n\nthere were days i cried and questioned everything from my company to whether i belonged there at all.\n\n𝒔𝒐𝒎𝒆𝒉𝒐𝒘, 𝒕𝒉𝒆 𝒑𝒆𝒐𝒑𝒍𝒆 𝒄𝒐𝒎𝒑𝒆𝒕𝒊𝒏𝒈 𝒇𝒐𝒓 𝒕𝒉𝒆 𝒔𝒂𝒎𝒆 $100,000 𝒘𝒆𝒓𝒆 𝒂𝒍𝒔𝒐 𝒕𝒉𝒆 𝒑𝒆𝒐𝒑𝒍𝒆 𝒊'𝒅 𝒔𝒕𝒊𝒍𝒍 𝒃𝒆 𝒂𝒘𝒂𝒌𝒆 𝒘𝒊𝒕𝒉 𝒖𝒏𝒕𝒊𝒍 4𝒂𝒎.\n\nall that said, i can't reveal the winner yet.\n\n𝒎𝒂𝒚𝒃𝒆 𝒕𝒉𝒆 𝒎𝒐𝒔𝒕 𝒅𝒂𝒏𝒈𝒆𝒓𝒐𝒖𝒔 𝒕𝒉𝒊𝒏𝒈 𝒚𝒐𝒖 𝒄𝒂𝒏 𝒈𝒊𝒗𝒆 𝒔𝒐𝒎𝒆𝒐𝒏𝒆 𝒊𝒔 𝒑𝒓𝒐𝒐𝒇 𝒕𝒉𝒂𝒕 𝒕𝒉𝒆𝒊𝒓 𝒍𝒊𝒇𝒆 𝒄𝒐𝒖𝒍𝒅 𝒃𝒆 𝒃𝒊𝒈𝒈𝒆𝒓.\n\ni'm coming home with a hungrier appetite for hard problems.",
    },
  },
  {
    expect: 'linkedinfluencer',
    post: {
      platform: 'linkedin',
      author: { name: 'Tyler R.', headline: 'Founder | Speaker | 3x Top Voice' },
      text: "Last week I had dinner with a billionaire.\n\nHe didn't talk about money once.\n\nInstead he asked me one question I can't stop thinking about:\n\n\"Who are you when nobody is watching?\"\n\nI've been building in public for 412 days now. Some days it feels like shouting into the void.\n\nBut that question reminded me why I started.\n\nMore on this soon. Stay tuned.",
    },
  },
  {
    expect: 'fancy_fonts',
    post: {
      platform: 'linkedin',
      author: { name: 'Kara P.', headline: 'Talent Partner' },
      text: "🚀 𝗕𝗜𝗚 𝗡𝗘𝗪𝗦 🚀\n\nI'm 𝘁𝗵𝗿𝗶𝗹𝗹𝗲𝗱 to share that I've joined Acme as Head of People! ✅\n\n𝑻𝒉𝒆 𝒃𝒆𝒔𝒕 𝒊𝒔 𝒚𝒆𝒕 𝒕𝒐 𝒄𝒐𝒎𝒆 💫",
    },
  },
];
