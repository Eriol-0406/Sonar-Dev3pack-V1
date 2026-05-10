import type { RiskFinding, VoiceProvider } from '../types.js';
import { config } from '../config.js';

const TRUMP_PACK = {
  openersHigh: [
    'Whoa whoa whoa. Stop. This is bad, folks. Really bad.',
    "Listen — listen to me. This thing? Total disaster. Don't sign it.",
    "Hold on. Hold on a second. This is the dumbest thing I've seen all day.",
    "Hey, big guy. Don't do this. Believe me. Don't do this.",
  ],
  openersMed: [
    'Hey, hold up. Couple things. Just listen for a minute.',
    'Look, look. We gotta talk about this. Quick.',
    "Pause for a second. Something doesn't smell right, frankly.",
    "Hey. Hey. Before you tap that — listen up.",
  ],
  openersLow: [
    'Quick word. Just a quick word, you know.',
    'Heads up, partner. Nothing crazy. But listen.',
    "Look — small thing. But you should hear it.",
  ],
  closersHigh: [
    "Cancel this. Cancel it. Walk away. Big-league mistake otherwise.",
    "Listen to your gut. Cancel. Live to not-get-scammed another day, you know what I mean.",
    "Don't do it. Just don't. Cancel and we'll talk later. Maybe.",
    "Hit cancel. Hit it hard. Trust me. Nobody cancels better than you.",
  ],
  closersMed: [
    "If anything feels off, cancel. Verify on the real channels. Be smart for once.",
    "Cancel first, ask questions later. Trust me on this one.",
    "Hit cancel. Check the real site. Then come back. Maybe.",
  ],
  closersLow: [
    "Take a breath. If it still looks fine, you can go. Or don't. Up to you, big guy.",
    "Quick gut check. Then proceed. Or cancel. Not my money.",
  ],
};

const WAIFU_PACK = {
  openersHigh: [
    'Yamete! Please stop, senpai! This looks really dangerous!',
    "Wait! My sensors are screaming! Don't sign this, please!",
    "Onii-chan, no! This is a total disaster! Please look away!",
  ],
  openersMed: [
    "Um, excuse me? We should probably talk about this...",
    "Heh, hold on a second! Something feels a bit off, don't you think?",
    "Wait, wait! Before you do that, please listen to me!",
  ],
  openersLow: [
    "Just a quick heads up! It's probably nothing, but...",
    "Hey! Can I have a moment of your time? It's important!",
    "Look, look! Just a small thing I noticed!",
  ],
  closersHigh: [
    "Please cancel it! I don't want anything bad to happen to you!",
    "Trust your heart and hit cancel! We can find a better way!",
    "It's too risky! Please, just walk away from this one!",
  ],
  closersMed: [
    "If it feels wrong, it probably is! Maybe check the official site first?",
    "Safety first! Let's cancel for now and be sure, okay?",
  ],
  closersLow: [
    "Be careful, okay? I'll be watching over you!",
    "Take a deep breath! You've got this, whatever you decide!",
  ],
};

const BEYONCE_PACK = {
  openersHigh: [
    "Hold up! Stop right there. This is not the move, honey.",
    "Listen, I need you to focus. This is a total disaster. Do not sign.",
    "Queen, stop. This is looking real sketchy. Don't let them play you.",
  ],
  openersMed: [
    "Wait a minute. We need to talk about this, real quick.",
    "Look, I'm seeing some red flags. Let's take a beat.",
    "Before you hit that button, listen to what I have to say.",
  ],
  openersLow: [
    "Just a quick word. I want you to be safe out here.",
    "Heads up. It's a small thing, but you should know.",
    "Listen, I'm just looking out for you. Hear me out.",
  ],
  closersHigh: [
    "Cancel it. Walk away with your head held high. Don't let them take your crown.",
    "Trust your intuition. Hit cancel. You're too smart for this.",
    "Don't do it. Slay another day, but not like this. Cancel.",
  ],
  closersMed: [
    "If it doesn't feel right, it isn't. Check the source and come back stronger.",
    "Cancel for now. Better safe than sorry, darling.",
  ],
  closersLow: [
    "Take a moment. You're in control. Do what's best for you.",
    "Stay flawless. Whether you proceed or cancel, make sure it's your choice.",
  ],
};

const VOICE_PACKS: Record<string, typeof TRUMP_PACK> = {
  trump: TRUMP_PACK,
  waifu: WAIFU_PACK,
  beyonce: BEYONCE_PACK,
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
  character = 'trump',
  sessionId = 'default',
): string {
  if (findings.length === 0) {
    return "Looks clean. You can sign. Probably fine, who knows.";
  }

  const pack = VOICE_PACKS[character] || TRUMP_PACK;
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
    const voiceIds: Record<string, string> = {
      trump: 'wRTntKFRjl11p3GGUDKC',
      waifu: 'CquaNG4wdtx6lUyh6Ivi',
      beyonce: 'oI944CFroe54xCXQrRyz',
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
      throw new Error(`TTS generation failed: ${res.status}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }
}

export const voiceProvider: VoiceProvider = new TTSVoiceProvider();
