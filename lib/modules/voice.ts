import type { RiskFinding, VoiceProvider } from '../types.js';
import { config } from '../config.js';

const JESSIE_PACK = {
  // Friendly educator: warm, patient, explains the "why", never scolds.
  openersHigh: [
    "Okay, pause with me for a second. I need you to see this before you sign anything.",
    "Hey, hold on. I know this looks fine, but let me walk you through what I found.",
    "Let's slow down together. There are some serious red flags here, and I want you to understand them.",
    "Before you tap that, let me show you something important. This is exactly how people get caught.",
  ],
  openersMed: [
    "Quick check-in before you continue. A couple of things stood out to me.",
    "Let's take a breath here. Nothing is certain yet, but here's what I noticed.",
    "One moment. I'd rather over-explain than watch you lose funds, so here's the picture.",
  ],
  openersLow: [
    "Small thing, and probably nothing. But you should know it.",
    "Just a gentle heads-up. Here's what I saw.",
    "Nothing alarming, but I'd be a poor teacher if I didn't mention it.",
  ],
  closersHigh: [
    "My honest advice: cancel this one. Go to the real site yourself, type the address by hand, and check. You lose nothing by waiting.",
    "Please cancel. Scammers count on you feeling rushed. Take the time, verify through an official channel, and come back if it checks out.",
    "Cancel it. Then think about how you got here, because that's the lesson that protects you next time.",
  ],
  closersMed: [
    "I'd cancel and double-check through the official site first. If it's real, it'll still be there in five minutes.",
    "When in doubt, wait it out. Verify first, sign second.",
    "Cancel for now. Confirm it independently, then decide with a clear head.",
  ],
  closersLow: [
    "If it still makes sense to you, go ahead. You've done the check, and that's what matters.",
    "Take a second, trust your judgement, and proceed if it all adds up.",
  ],
};

const AK_PACK = {
  // Posh, well-spoken elderly British gentleman: dry, unimpressed, faintly appalled.
  openersHigh: [
    "Good heavens. No. Absolutely not. Put that down at once.",
    "I say. Before you do something profoundly foolish, do allow me a word.",
    "Oh dear. Oh dear, oh dear. One rather hoped you'd know better than this.",
    "Stop. I shan't say it twice. Well, I shall, but I'd rather not.",
  ],
  openersMed: [
    "A moment, if you please. Something here is not quite cricket.",
    "Hmm. I've seen this sort of thing before, and it seldom ends in champagne.",
    "Do forgive the interruption, but I have concerns. Several, in fact.",
  ],
  openersLow: [
    "A trifling matter, but worth a mention over tea.",
    "Nothing dreadful. Merely an observation from an old man.",
    "One small note, if you'll indulge me.",
  ],
  closersHigh: [
    "Cancel it. Have a cup of tea. Then verify through the proper channels like a civilised person.",
    "Walk away, dear boy. Or girl. Whichever. Walk away regardless.",
    "I implore you: cancel. Fortune favours the bold, but it positively adores the careful.",
  ],
  closersMed: [
    "I'd cancel and make enquiries first. Haste has bankrupted better men than either of us.",
    "Cancel, verify, and only then proceed. In that order, mind.",
    "Prudence, my dear fellow. Check the genuine article before committing.",
  ],
  closersLow: [
    "If it still seems in order, do carry on. I've said my piece.",
    "Proceed if you must. I shall be here, quietly judging, should it go wrong.",
  ],
};

const ELON_PACK = {
  // Steady, articulate engineer: calm, precise, first-principles reasoning.
  openersHigh: [
    "Okay. Stop. Let's reason about this from first principles, because the data here is bad.",
    "Hold on. I've looked at the signals, and the probability this is legitimate is very low.",
    "Wait. Don't sign yet. Every indicator on this one is pointing the wrong way.",
    "Let me be direct. This has the signature of a drainer. Not a maybe. A pattern.",
  ],
  openersMed: [
    "Quick pause. The risk model flagged a few things that need your attention.",
    "Before you proceed, some anomalies. Not conclusive, but non-trivial.",
    "Let's look at the numbers for a second. A couple of them are off.",
  ],
  openersLow: [
    "Minor signal. Low weight. Still worth logging.",
    "Nothing critical. One observation before you continue.",
    "Small anomaly. Probably noise. Mentioning it anyway.",
  ],
  closersHigh: [
    "Cancel. Verify the source through an independent channel. The cost of waiting is zero. The cost of being wrong is everything.",
    "Abort this one. Rapid unscheduled disassembly of your wallet is not a good outcome.",
    "Cancel it. Assume it's hostile until proven otherwise. That's just good engineering.",
  ],
  closersMed: [
    "I'd cancel and confirm through the official site. Reduce uncertainty first, then act.",
    "Cancel, verify, iterate. Signing is the one step you can't roll back.",
    "Hold. Get more data. Then decide.",
  ],
  closersLow: [
    "If the rest checks out, proceed. Risk is acceptable.",
    "Your call. The signal is weak. Go ahead if you've verified the basics.",
  ],
};

const VOICE_PACKS: Record<string, typeof JESSIE_PACK> = {
  jessie: JESSIE_PACK,
  ak: AK_PACK,
  elon: ELON_PACK,
};
const CONNECTORS = [
  'And another thing — ',
  'Also, listen — ',
  'Plus — ',
  'On top of that — ',
  'And get this — ',
];

function seededPick<T>(arr: readonly T[], seed: string, salt: string): T {
  let h = 0;
  const s = seed + salt;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

function ageWord(days: number): string {
  if (days <= 0) return 'literally hours old';
  if (days === 1) return 'one day old';
  if (days < 7) return `${days} days old`;
  if (days < 30) return `${days} days old — barely a month`;
  return `${days} days old`;
}

type LineBuilder = (f: RiskFinding) => string;

const RULE_LINES: Record<string, LineBuilder> = {
  large_transfer: (f) => {
    const sol = (f.evidence?.sol as number | undefined) ?? null;
    return sol != null
      ? `it's sending ${sol} SOL out the door`
      : "it's a huge transfer";
  },
  unlimited_approval: () =>
    "it wants UNLIMITED access to your tokens",
  unverified_program: () =>
    "the program is unverified. Nobody knows what it does",
  complex_transaction: (f) => {
    const n = (f.evidence?.count as number | undefined) ?? null;
    return n != null
      ? `it's hitting ${n} different programs in one shot`
      : "it's juggling a bunch of programs at once";
  },
  fake_token_name: () =>
    "that token name is FAKE. It's pretending to be a real one",
  wallet_age: (f) => {
    const days = (f.evidence?.walletAgeDays as number | undefined) ?? null;
    return days != null
      ? `the address you'd be trusting is ${ageWord(days)}`
      : "the address is brand new";
  },
  no_prior_interaction: () =>
    "you've never touched this address before",
  scam_reports: (f) => {
    const count = (f.evidence?.count as number | undefined) ?? null;
    if (count != null && count >= 5) {
      return `${count} different people already reported this as a scam on Chainabuse`;
    }
    if (count != null && count > 0) {
      return "somebody already reported this address as a scam on Chainabuse";
    }
    return "this address has scam reports against it";
  },
  domain_scam_reports: (f) => {
    const domain = (f.evidence?.domain as string | undefined) ?? 'this site';
    const count = (f.evidence?.count as number | undefined) ?? 0;
    return count >= 5
      ? `${count} people already reported ${domain} as a scam on Chainabuse`
      : `${domain} has already been reported as a scam on Chainabuse`;
  },
  sanctioned_address: (f) => {
    const ids = (f.evidence?.identifications as Array<{ name?: string }> | undefined) ?? [];
    const name = ids[0]?.name;
    return name ? `this address is sanctioned. ${name}. That is a crime to touch` : 'this address is on a government sanctions list';
  },
  webacy_risk: (f) => {
    const tags = (f.evidence?.tags as string[] | undefined) ?? [];
    return tags.length ? `Webacy flags it for ${tags[0].toLowerCase()}` : 'Webacy rates this address as risky';
  },
  blocklisted_address: (f) => {
    const sources = (f.evidence?.sources as string[] | undefined) ?? [];
    return sources.length
      ? `this address is on the ${sources.join(' and ')} scam list. Already flagged`
      : 'this address is on a scam blocklist';
  },
  blocklisted_domain: (f) => {
    const domain = (f.evidence?.domain as string | undefined) ?? 'this site';
    return `${domain} is a known phishing site. It's on the blocklist`;
  },
  sweep_pattern: () =>
    'this wallet collects money from dozens of people and sweeps it straight out. That is a drainer',
  instant_drain: () =>
    'money goes into this wallet and leaves the second it lands',
  dust_sprayer: () =>
    'this wallet sprays dust at thousands of people. Address poisoning',
  burst_activity: () =>
    'brand new wallet, already hyperactive. Bots do that',
  domain_age: (f) => {
    const days = (f.evidence?.domainAgeDays as number | undefined) ?? null;
    const domain = (f.evidence?.domain as string | undefined) ?? "this site";
    return days != null
      ? `${domain} was registered ${ageWord(days)}`
      : `${domain} is a brand-new website`;
  },
  fake_domain_pattern: (f) => {
    const domain = (f.evidence?.domain as string | undefined) ?? "the site";
    return `${domain} is a fake. Look at the spelling`;
  },
  phishing_message: () =>
    "the message they want you to sign? Phishing language",
  transfer_above_baseline: (f) => {
    const mult = (f.evidence?.multiple as number | undefined) ?? null;
    return mult != null
      ? `this is ${mult} times bigger than your usual transfer`
      : "this is way bigger than what you normally send";
  },
  unfamiliar_counterparty: () =>
    "you've never sent anything to this address before",
  unfamiliar_protocol: () =>
    "you've never used this program before",
  off_hours_signing: (f) => {
    const hour = (f.evidence?.hourUtc as number | undefined) ?? null;
    return hour != null
      ? `it's ${String(hour).padStart(2, '0')}:00 UTC. Way past your bedtime`
      : "you're signing at a weird hour";
  },
};

function lineForFinding(f: RiskFinding): string {
  const builder = RULE_LINES[f.rule];
  if (builder) return builder(f);
  return f.message.replace(/\.$/, '').toLowerCase();
}

function joinSentences(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(' ');
}

export function buildVoiceScript(
  findings: RiskFinding[],
  score: number,
  character = 'jessie',
  sessionId = 'default',
): string {
  if (findings.length === 0) {
    return "Looks clean. You can sign. Probably fine, who knows.";
  }

  const pack = VOICE_PACKS[character] || JESSIE_PACK;
  const ordered = [...findings].sort((a, b) => b.points - a.points);
  const top = ordered.slice(0, 3);

  const opener = seededPick(
    score >= 80 ? pack.openersHigh : score >= 60 ? pack.openersMed : pack.openersLow,
    sessionId,
    'opener',
  );
  const closer = seededPick(
    score >= 80 ? pack.closersHigh : score >= 60 ? pack.closersMed : pack.closersLow,
    sessionId,
    'closer',
  );

  const sentences: string[] = [opener];
  top.forEach((f, i) => {
    const body = lineForFinding(f);
    if (i === 0) {
      sentences.push(`Here's the thing — ${body}`);
    } else {
      const conn = seededPick(CONNECTORS, sessionId, `c${i}`);
      sentences.push(`${conn}${body}`);
    }
  });
  sentences.push(closer);

  return joinSentences(sentences);
}

export class TTSVoiceProvider implements VoiceProvider {
  readonly name = 'tts' as const;

  async generate(script: string, character: string, _sessionId: string): Promise<Buffer> {
    // ElevenLabs voice IDs (must be present in the account's My Voices).
    const voiceIds: Record<string, string> = {
      jessie: '7ceZgj78jCCeAW93ItNk', // Jessie - Friendly Educator
      ak: 'y0SYydk17lMbUIUvSf3N', // AK - British Posh Well-Spoken Old Man
      elon: 'rJ4KGss9TSKfyhkSuCRh', // Elon - Steady, Articulate and Dynamic
    };

    const voiceId = voiceIds[character] || config.ELEVENLABS_VOICE_ID;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': config.ELEVENLABS_API_KEY,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.45, similarity_boost: 0.7, style: 0.55, use_speaker_boost: true },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[ElevenLabs] Error ${res.status}: ${errorText}`);
      let detail = errorText.slice(0, 300);
      try {
        const j = JSON.parse(errorText) as { detail?: { status?: string; message?: string } | string };
        if (typeof j.detail === 'string') detail = j.detail;
        else if (j.detail) detail = [j.detail.status, j.detail.message].filter(Boolean).join(': ');
      } catch {}
      throw new Error(`ElevenLabs ${res.status} (voice ${voiceId}): ${detail}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }
}

export const voiceProvider: VoiceProvider = new TTSVoiceProvider();
