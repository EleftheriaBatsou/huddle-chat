// Backfilled demo history. Lines are [author, text, options]; authors are first names.
export type Line = [string, string, { replies?: [string, string][]; react?: string[]; image?: string }?]

export const USERS = [
  ['Anna Novak', 'anna@example.com'],
  ['Marco Rossi', 'marco@example.com'],
  ['Priya Shah', 'priya@example.com'],
  ['Liam O\'Connor', 'liam@example.com'],
  ['Sofia García', 'sofia@example.com'],
  ['Kenji Tanaka', 'kenji@example.com'],
  ['Emma Schmidt', 'emma@example.com'],
  ['Noah Williams', 'noah@example.com'],
  ['Zara Ahmed', 'zara@example.com'],
  ['Tomás Silva', 'tomas@example.com'],
] as const

export const CHANNELS: { slug: string; topic: string; private?: boolean; members?: string[]; lines: Line[] }[] = [
  {
    slug: 'general',
    topic: 'Company-wide announcements and everyday chatter',
    lines: [
      ['Priya', 'Morning all ☀️ reminder that the Q3 planning doc is open for comments until Friday'],
      ['Marco', 'Thanks Priya — is the roadmap section final or still a draft?'],
      ['Priya', 'Still a draft. The big-ticket items are locked, the "maybe" column is very much up for debate'],
      ['Noah', 'Support perspective: the #1 ask this month was still "search that actually finds things" 😅', { react: ['😂', '💯'] }],
      ['Kenji', 'Good news then — search is on the plan, and we\'re putting a proper engine behind it this time'],
      ['Zara', 'I can share the query logs from support tickets if that helps prioritise which filters matter'],
      ['Priya', 'Yes please @Zara, drop them in the doc appendix', { react: ['👍'] }],
      ['Anna', 'Design crit moves to Thursday 2pm this week, the usual room is booked for interviews'],
      ['Emma', 'Noted! Bringing the new composer prototype 🎨'],
      ['Tomás', 'Heads up: planned maintenance on the staging database tonight 22:00–22:30 CET. Should be invisible, but just in case'],
      ['Liam', 'Thanks for the warning — I\'ll pause the load tests'],
      ['Sofia', 'Who left the amazing banana bread in the kitchen?? 🍌🍞', { react: ['😍', '🙌'], replies: [['Noah', 'Guilty. My grandma\'s recipe'], ['Sofia', 'Your grandma is a legend'], ['Emma', 'Recipe please, for science']] }],
      ['Priya', 'All-hands is moved to Wednesday 4pm. Agenda: roadmap, new hires, and a demo from the realtime squad'],
      ['Kenji', 'We\'ll show multi-instance chat — two app containers, one conversation. Should be fun'],
      ['Marco', 'If it survives the live demo I\'m buying pizza 🍕', { react: ['🍕', '😂'] }],
      ['Anna', 'Welcome @Zara to the data team officially! 🎉', { react: ['🎉', '👋', '❤️'] }],
      ['Zara', 'Thank you! Excited to be here. Ask me anything about dashboards, I dare you'],
      ['Noah', 'How many coffees does this office drink per week? For science.'],
      ['Zara', 'Challenge accepted. Report on Monday ☕📊', { react: ['😂'] }],
      ['Tomás', 'Maintenance done, no incidents. Staging DB is on the new version'],
      ['Liam', 'Load tests resumed — p95 is actually a bit better than before'],
      ['Priya', 'Nice. Please note the before/after numbers in the infra log'],
      ['Emma', 'Friendly reminder that the design system office hours are every Tuesday'],
      ['Sofia', 'And they are genuinely the best hour of the week'],
      ['Marco', 'Anyone going to the meetup on Thursday? Talk on WebSocket scaling looks relevant'],
      ['Kenji', 'I\'ll be there. Mostly to heckle about sticky sessions 😄'],
      ['Liam', 'Count me in'],
      ['Zara', 'Coffee report is in: 412 cups last week. The espresso machine is the most-used device in the building ☕', { react: ['🤯', '☕', '😂'], replies: [['Noah', 'I knew it'], ['Tomás', 'We should put it on the status page'], ['Priya', 'Adding "espresso uptime" to the SLOs']] }],
      ['Anna', 'Office plants got watered. You\'re welcome, Monstera gang 🌿'],
      ['Priya', 'Roadmap is final — thanks everyone for the comments. Link pinned in the doc'],
      ['Noah', 'Support queue is at an all-time low this week, great work everyone 👏', { react: ['👏', '🔥'] }],
      ['Kenji', 'Demo went great, pizza is on Marco 🍕', { react: ['🍕', '🎉', '😂'] }],
      ['Marco', 'A deal is a deal. Friday lunch, kitchen'],
      ['Emma', 'Can we please get the pineapple one this time'],
      ['Liam', 'I\'m going to pretend I didn\'t read that'],
      ['Sofia', 'Pineapple on pizza is a valid design choice'],
      ['Tomás', 'Reminder: rotate your laptop disk-encryption recovery keys by end of month'],
      ['Zara', 'New dashboard for message volume is live — ask me for access'],
      ['Priya', 'Hiring update: two offers accepted 🎉 Frontend and SRE. Starting in three weeks', { react: ['🎉', '🙌'] }],
      ['Anna', 'Amazing! I\'ll set up the design onboarding for the frontend hire'],
      ['Noah', 'Is the fire drill still happening this afternoon?'],
      ['Tomás', 'Yes, 3pm. Please actually leave the building this time 😅'],
      ['Emma', 'The fire drill was a great excuse for a walk honestly'],
      ['Kenji', 'Weekly wins thread 👇 drop yours', { replies: [['Liam', 'Shipped the cursor pagination, OFFSET is gone for good'], ['Emma', 'Composer now supports drag-and-drop uploads'], ['Zara', 'Search analytics dashboard'], ['Sofia', 'Finished the new avatar palette'], ['Tomás', 'Zero-downtime deploys on the worker service']] }],
      ['Priya', 'Love this. Let\'s make the wins thread a Friday tradition'],
      ['Marco', 'Have a great weekend everyone 👋', { react: ['👋'] }],
      ['Anna', 'Good morning! Coffee machine is fixed, crisis averted ☕'],
      ['Noah', 'Best news of the week'],
      ['Zara', 'Productivity metrics expected to recover within the hour'],
      ['Priya', 'Reminder: all-hands in 30 minutes, see you there'],
    ],
  },
  {
    slug: 'design',
    topic: 'Pixels, palettes and friendly critique',
    lines: [
      ['Anna', 'Kicking off the chat redesign 🎨 Goal: playful but calm. Think Figma energy, not a casino'],
      ['Sofia', 'Love it. Proposing a vivid accent — #7C5CFF — with lots of air around it'],
      ['Emma', 'That purple is gorgeous. Contrast on white?'],
      ['Sofia', '4.9:1 for text on white, so fine for buttons and links. We keep body copy in ink #1B1B2F'],
      ['Anna', 'First hero exploration 👇 feedback welcome', { image: 'hero-exploration-v3.svg', react: ['😍', '🔥'] }],
      ['Emma', 'The blobs are so good. Could we reuse the shapes for empty states?'],
      ['Anna', 'Yes! That was the plan — one shape language across the app'],
      ['Marco', 'Engineering question: are the gradients CSS or images?'],
      ['Sofia', 'Pure CSS where possible. Radial gradients + blur. Images only for illustrations'],
      ['Kenji', 'CSS gradients will keep the bundle tiny, thank you 🙏'],
      ['Sofia', 'Avatar palette proposal: cycle #7C5CFF #15D7C4 #FFC93C #FF5C7C #0D99FF #2BD968', { image: 'palette-2026.svg', react: ['🎨', '💯'], replies: [['Anna', 'The teal is perfect'], ['Emma', 'Do we have enough contrast on the yellow with white initials?'], ['Sofia', 'Good catch — yellow gets ink initials instead of white'], ['Anna', 'Ship it']] }],
      ['Emma', 'Messages grouped by author, hover actions on the right. Thoughts on the hover delay?'],
      ['Anna', 'No delay on show, 150ms on hide. Feels snappy but not flickery'],
      ['Sofia', 'And rounded 16px on cards. Everything soft'],
      ['Emma', 'What about the presence dots — online green #2BD968, away yellow #FFC93C, offline grey?'],
      ['Anna', 'Yes. And put a white ring around them so they pop on any avatar colour'],
      ['Priya', 'From a product view: typing indicator is a must. People love knowing someone is replying'],
      ['Sofia', 'Three dots, gentle bounce, staggered by 150ms. I\'ll mock it'],
      ['Emma', 'I built a quick prototype of the typing dots — it\'s ridiculously satisfying', { react: ['😍'] }],
      ['Anna', 'Search modal: ⌘K, centred, big input, results with highlighted snippets. Should feel premium'],
      ['Sofia', 'Blurred backdrop + a subtle scale-in? 180ms spring'],
      ['Emma', 'Springs everywhere. I\'m in'],
      ['Marco', 'Please keep the keyboard navigation in the search results — arrows + enter'],
      ['Anna', 'Absolutely, keyboard-first'],
      ['Sofia', 'Font: Plus Jakarta Sans. Rounded enough to be friendly, clear enough for long threads'],
      ['Emma', 'Tested it at 14px — very readable'],
      ['Anna', '@Emma can you check the emoji picker at small widths?'],
      ['Emma', 'On it. It\'s a bit cramped under 360px, I\'ll switch to 7 columns'],
      ['Sofia', 'Reaction chips: pill shaped, count on the right, highlight when you reacted'],
      ['Anna', 'Should we animate new messages sliding in?'],
      ['Emma', 'Yes but subtle — 8px translate + fade, 220ms. Anything more gets annoying in busy channels'],
      ['Kenji', 'Performance note: please don\'t animate layout properties, only transform/opacity 🙏'],
      ['Emma', 'Transform and opacity only, promise'],
      ['Sofia', 'Unread badges: accent purple pill. Mentions: coral #FF5C7C so they stand out'],
      ['Priya', 'Coral for mentions is smart, instantly readable'],
      ['Anna', 'Empty-state illustration draft — the chat bubbles are meant to look like they\'re chatting to each other', { image: 'empty-state-bubbles.svg', react: ['🥹', '❤️', '🎉'] }],
      ['Noah', 'This is adorable'],
      ['Sofia', 'Final critique on Thursday — bring your strongest opinions'],
      ['Emma', 'Implemented the three-pane layout. Channels | messages | presence. Collapses nicely on tablet'],
      ['Anna', 'Presence sidebar looks great. Could the "away" people be slightly faded?'],
      ['Emma', '70% opacity on the name. Subtle but noticeable'],
      ['Sofia', 'Chef\'s kiss 🤌'],
      ['Anna', 'Dark mode — later milestone, but let\'s keep tokens ready for it'],
      ['Emma', 'All colours are CSS custom properties already'],
      ['Priya', 'Can we get a quick screen recording for the all-hands?'],
      ['Emma', 'Recording it tomorrow after the search integration lands'],
      ['Sofia', 'Updated the icon set — rounded 2px strokes everywhere'],
      ['Anna', 'Great progress this week team 💜', { react: ['💜', '🙌'] }],
    ],
  },
  {
    slug: 'engineering',
    topic: 'Builds, deploys, bugs and the occasional yak shave',
    lines: [
      ['Kenji', 'Architecture for the new chat, short version: Fastify + ws, Postgres for history, Valkey for realtime, NATS for jobs, Meilisearch for search'],
      ['Liam', 'Why Valkey pub/sub instead of just broadcasting from the process?'],
      ['Kenji', 'Because the moment we run two app instances, a user on instance A won\'t see a message sent via instance B. Pub/sub fans it out to every instance', { react: ['💡', '👍'], replies: [['Liam', 'Got it — every instance subscribes and delivers to its own sockets'], ['Marco', 'And the sending instance also receives its own publish, so there\'s one code path'], ['Kenji', 'Exactly. No special cases, no sticky sessions']] }],
      ['Marco', 'Presence in Valkey with TTL keys, refreshed by a heartbeat. If a laptop lid closes, the user ages out automatically'],
      ['Tomás', 'How short is the TTL?'],
      ['Marco', '40s, heartbeat every 15s. So worst case someone looks online ~40s after vanishing'],
      ['Tomás', 'Reasonable'],
      ['Liam', 'Typing indicators also TTL\'d keys. They never touch Postgres'],
      ['Emma', 'Frontend question: how do we handle reconnects without losing messages?'],
      ['Liam', 'Client remembers the last message id it saw. On reconnect it calls /api/sync?sinceId=… and merges whatever it missed'],
      ['Emma', 'And edits/deletes during the gap?'],
      ['Liam', 'Sync also returns anything edited or deleted since the last sync timestamp'],
      ['Kenji', 'Pagination: keyset on (created_at, id). @Liam please make sure there\'s no OFFSET anywhere', { replies: [['Liam', 'Zero OFFSETs. Index on (channel_id, created_at, id) and a partial one for top-level messages'], ['Kenji', '🙏']] }],
      ['Marco', 'Attachments: browser gets a presigned PUT, uploads straight to object storage. API never touches the bytes'],
      ['Tomás', 'Then a job goes to the queue for thumbnails?'],
      ['Marco', 'Yes — JetStream work-queue. Worker generates a WebP thumbnail with sharp and updates the attachment row'],
      ['Liam', 'And then pushes an event through Valkey so the UI swaps the placeholder for the thumbnail'],
      ['Emma', 'Love that the message shows up immediately and the preview pops in after'],
      ['Zara', 'Search: are we indexing on every send?'],
      ['Kenji', 'Yes, single-document upserts are async tasks in Meilisearch so they don\'t block. Bulk reindex runs in the worker'],
      ['Zara', 'Typo tolerance out of the box is a big win for support queries'],
      ['Tomás', 'Deploy plan: dev containers for iteration, a stage service for the production build, then scale stage to 2+ containers to prove fan-out'],
      ['Kenji', 'That\'s the demo I want at the all-hands'],
      ['Liam', 'Found a fun bug: messages sent during a reconnect were duplicated on the client', { react: ['🐛'] }],
      ['Emma', 'Classic. Dedupe by id on insert?'],
      ['Liam', 'Dedupe by id, and optimistic messages reconcile by clientId'],
      ['Marco', 'Rate limiting on sends: fixed window in Valkey, 20 messages / 10s per user'],
      ['Noah', 'Please make the 429 message friendly, users will see it'],
      ['Marco', '"Slow down — you can send again in 4s" 🙂'],
      ['Noah', 'Perfect'],
      ['Tomás', 'Worker is on its own service now so thumbnailing can\'t slow the API'],
      ['Kenji', 'Unread counts: Valkey hashes per user, cleared when you read. Postgres keeps last_read_message_id as the durable copy'],
      ['Liam', 'Mentions tracked separately so the badge can go coral'],
      ['Emma', 'Hooked it up — the mention badge is very satisfying'],
      ['Zara', 'Load test: 500 simulated clients, messages spread across 2 instances, p95 delivery 38ms', { react: ['🚀', '🔥', '🤯'] }],
      ['Kenji', 'That\'s the number for the slide 🎯'],
      ['Liam', 'PR up for thread replies. Replies don\'t bump channel unreads unless you\'re mentioned'],
      ['Marco', 'Reviewed, left two small comments, approved'],
      ['Tomás', 'CI is green on main. Staging deploy in progress'],
      ['Tomás', 'Staging deploy done ✅'],
      ['Emma', 'Infinite scroll keeps the DOM bounded — we trim far-away messages so it stays smooth even over thousands'],
      ['Kenji', 'Tested with 10k messages in #random, scrolling is buttery'],
      ['Liam', 'Health endpoint reports the instance id — handy for proving which container you\'re on'],
      ['Marco', 'Edge case: deleted message with replies shows a placeholder so the thread still makes sense'],
      ['Emma', 'Nice touch'],
      ['Zara', 'Search results now include a jump-to-message link that loads the surrounding context'],
      ['Kenji', 'Great week, engineering. Ship it 🚢', { react: ['🚢', '🎉'] }],
      ['Liam', 'Tiny refactor: moved all the Valkey keys into one module so they\'re easy to audit'],
      ['Tomás', 'Alerting on NATS consumer lag is set up'],
      ['Marco', 'Anyone seen flaky tests in the ws suite? One of them times out every ~20 runs'],
      ['Liam', 'Yeah, it\'s the ping interval — I\'ll fake the timers'],
    ],
  },
  {
    slug: 'random',
    topic: 'Coffee, cats and everything in between',
    lines: [
      ['Noah', 'Unpopular opinion: cold brew is overrated'],
      ['Sofia', 'Blocking you'],
      ['Liam', 'Cold brew is a lifestyle, Noah', { react: ['😂'] }],
      ['Emma', 'My cat just walked across my keyboard and pushed to a branch. She has commit rights now'],
      ['Kenji', 'Did CI pass?'],
      ['Emma', 'Yes. Better test coverage than my last PR honestly 🐈', { react: ['😂', '🐈', '💯'] }],
      ['Zara', 'Lunch recommendation: the new ramen place around the corner. Get the spicy miso'],
      ['Tomás', 'Went yesterday, can confirm it\'s excellent 🍜'],
      ['Marco', 'Adding it to the list'],
      ['Anna', 'Sunset from the roof terrace tonight 🌅', { image: 'rooftop-sunset.svg', react: ['😍', '🌅', '❤️'] }],
      ['Sofia', 'The colours! Straight into the palette'],
      ['Priya', 'Book club: this month is "The Mythical Man-Month". Yes, again. It\'s still true'],
      ['Liam', 'Adding people to a late project makes it later. Adding pizza makes it tolerable'],
      ['Noah', 'Is there a running club? I need accountability'],
      ['Tomás', 'Tuesday and Thursday mornings, 7am, 5k loop by the river 🏃'],
      ['Noah', '7am 😭'],
      ['Tomás', 'Character building'],
      ['Emma', 'Weekend plans? I\'m going bouldering for the first time'],
      ['Kenji', 'Chalk everything. Also your ego'],
      ['Zara', 'I\'m baking. Attempting croissants. Pray for me', { replies: [['Sofia', 'Croissants are a 3-day commitment, respect'], ['Zara', 'Day 2 update: butter everywhere'], ['Zara', 'Day 3: they are... flat but delicious 🥐'], ['Noah', 'Flat croissants are just crispy croissants']] }],
      ['Marco', 'PSA: the good headphones are back in the meeting room drawer'],
      ['Liam', 'Somebody has been hoarding them 👀'],
      ['Sofia', 'Office playlist suggestions go here 🎶'],
      ['Emma', 'Lo-fi beats, obviously'],
      ['Kenji', 'Synthwave for deploy days'],
      ['Tomás', 'Complete silence and the hum of servers'],
      ['Priya', 'Tomás is a monk'],
      ['Noah', 'Just saw a dog wearing tiny boots outside. Best part of my day 🐕'],
      ['Anna', 'Photos or it didn\'t happen'],
      ['Noah', 'He was too fast. Majestic.'],
      ['Zara', 'Fun fact: honey never spoils. Archaeologists have found edible honey in 3000-year-old tombs'],
      ['Liam', 'That\'s the kind of uptime I aspire to', { react: ['😂'] }],
      ['Emma', 'Who wants to do a team escape room next month?'],
      ['Marco', 'Yes!'],
      ['Sofia', 'Yes, but I\'m not solving any maths puzzles'],
      ['Kenji', 'I\'ll do the maths, you do the vibes'],
      ['Priya', 'Booking for 8, first Friday of the month'],
      ['Tomás', 'The office Monstera has a new leaf 🌱', { react: ['🌱', '🎉'] }],
      ['Anna', 'Our child is growing up'],
      ['Noah', 'Should we give the plant a name?'],
      ['Emma', 'Latency'],
      ['Liam', 'P99'],
      ['Zara', 'Fern Gully'],
      ['Sofia', 'It\'s a Monstera, so obviously "Monty"', { react: ['🌿', '💯'] }],
      ['Priya', 'Monty it is'],
      ['Kenji', 'Friday song: something upbeat please'],
      ['Marco', 'Queued up some disco. It\'s the weekend 🕺'],
      ['Emma', 'Have a lovely weekend ✨'],
    ],
  },
  {
    slug: 'leads',
    topic: 'Team leads — planning, hiring, people stuff',
    private: true,
    members: ['Anna', 'Kenji', 'Priya', 'Marco'],
    lines: [
      ['Priya', 'Private channel for leads — let\'s keep hiring and planning discussion here'],
      ['Kenji', 'Headcount for next quarter: I\'d like one more backend engineer for the realtime work'],
      ['Anna', 'Design is OK for now, but we\'ll need a content designer by the end of the year'],
      ['Marco', 'Agree on backend. The worker + search pipeline deserves an owner'],
      ['Priya', 'I\'ll put both in the plan. Backend first'],
      ['Kenji', 'Interview loop draft is in the doc — please review before Thursday', { react: ['👍'] }],
      ['Anna', 'Added a portfolio walkthrough step for design candidates'],
      ['Priya', 'Offsite ideas? Somewhere with good wifi and bad weather so people stay inside 😄'],
      ['Marco', 'Mountain cabin, big table, zero distractions'],
      ['Kenji', 'I vote cabin'],
      ['Anna', 'Cabin 🏔️'],
      ['Priya', 'Cabin it is. I\'ll get quotes'],
      ['Kenji', 'Performance reviews start in two weeks — templates are in the shared folder'],
      ['Anna', 'Thanks for the reminder. Can we keep peer feedback optional this round?'],
      ['Priya', 'Yes, optional but encouraged'],
      ['Marco', 'Demo day went well — execs loved the multi-instance fan-out'],
      ['Kenji', 'Proud of the team on this one 💜', { react: ['💜', '🙌'] }],
    ],
  },
]

// Procedurally drawn artwork for the seeded image attachments (no external assets).
const PALETTE = ['#7C5CFF', '#15D7C4', '#FFC93C', '#FF5C7C', '#0D99FF', '#2BD968']

function blobs(seed: number, count: number, w: number, h: number) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: count }, (_, i) => {
    const cx = Math.round(rnd() * w), cy = Math.round(rnd() * h), r = Math.round(90 + rnd() * 220)
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PALETTE[i % PALETTE.length]}" opacity="${(0.55 + rnd() * 0.4).toFixed(2)}"/>`
  }).join('')
}

export function artwork(name: string): string {
  const w = 1200, h = 800
  if (name === 'palette-2026.svg') {
    const sw = PALETTE.map((c, i) => `
      <rect x="${80 + i * 180}" y="200" width="150" height="300" rx="28" fill="${c}"/>
      <text x="${155 + i * 180}" y="560" font-family="sans-serif" font-size="22" font-weight="700" fill="#1B1B2F" text-anchor="middle">${c}</text>`).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="100%" height="100%" fill="#FBFAFF"/>
      <text x="80" y="140" font-family="sans-serif" font-size="56" font-weight="800" fill="#1B1B2F">Avatar palette</text>${sw}
      <text x="80" y="680" font-family="sans-serif" font-size="26" fill="#6B6B85">Cycle in order · rounded 16px · soft shadow</text></svg>`
  }
  if (name === 'rooftop-sunset.svg') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3B2A8C"/><stop offset=".45" stop-color="#FF5C7C"/><stop offset=".8" stop-color="#FFC93C"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#sky)"/>
      <circle cx="600" cy="560" r="150" fill="#FFE39A"/>
      <path d="M0 600 L120 520 L200 560 L300 470 L420 580 L520 540 L640 610 L760 500 L880 570 L1000 480 L1200 590 L1200 800 L0 800Z" fill="#1B1B2F"/>
      <rect x="140" y="560" width="40" height="240" fill="#1B1B2F"/><rect x="860" y="520" width="60" height="280" fill="#1B1B2F"/>
      </svg>`
  }
  if (name === 'empty-state-bubbles.svg') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect width="100%" height="100%" fill="#F3F0FF"/>
      <rect x="230" y="220" width="420" height="200" rx="80" fill="#7C5CFF"/><path d="M300 400 L270 480 L380 410Z" fill="#7C5CFF"/>
      <circle cx="360" cy="320" r="22" fill="#fff"/><circle cx="440" cy="320" r="22" fill="#fff"/><circle cx="520" cy="320" r="22" fill="#fff"/>
      <rect x="560" y="400" width="400" height="190" rx="80" fill="#15D7C4"/><path d="M880 570 L920 650 L810 585Z" fill="#15D7C4"/>
      <path d="M700 480 q60 60 120 0" stroke="#1B1B2F" stroke-width="16" fill="none" stroke-linecap="round"/>
      <circle cx="700" cy="455" r="14" fill="#1B1B2F"/><circle cx="820" cy="455" r="14" fill="#1B1B2F"/>
      </svg>`
  }
  // hero exploration
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><filter id="b"><feGaussianBlur stdDeviation="40"/></filter></defs>
    <rect width="100%" height="100%" fill="#FBFAFF"/><g filter="url(#b)">${blobs(7, 7, w, h)}</g>
    <rect x="120" y="250" width="620" height="300" rx="36" fill="#ffffff" opacity=".85"/>
    <text x="170" y="360" font-family="sans-serif" font-size="64" font-weight="800" fill="#1B1B2F">Talk, together.</text>
    <text x="170" y="430" font-family="sans-serif" font-size="30" fill="#6B6B85">Channels, threads and presence — instantly.</text>
    <rect x="170" y="470" width="200" height="56" rx="28" fill="#7C5CFF"/>
    <text x="270" y="507" font-family="sans-serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">Get started</text>
    </svg>`
}
