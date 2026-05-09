import type { RiskFinding, VoiceProvider } from '../types.js';
import { config } from '../config.js';

const OPENERS_HIGH = [
  'Whoa whoa whoa. Stop. This is bad, folks. Really bad.',
  "Listen — listen to me. This thing? Total disaster. Don't sign it.",
  "Hold on. Hold on a second. This is the dumbest fucking thing I've seen all day.",
  "Hey, big guy. Don't do this. Believe me. Don't do this.",
];

const OPENERS_MED = [
  'Hey, hold up. Couple things. Just listen for a minute.',
  'Look, look. We gotta talk about this. Quick.',
  "Pause for a second. Something doesn't smell right, frankly.",
  "Hey. Hey. Before you tap that — listen up.",
];

const OPENERS_LOW = [
  'Quick word. Just a quick word, you know.',
  'Heads up, partner. Nothing crazy. But listen.',
  "Look — small thing. But you should hear it.",
];

const CONNECTORS = [
  'And another thing — ',
  'Also, listen — ',
  'Plus — ',
  'On top of that — ',
  'And get this — ',
];

const CLOSERS_HIGH = [
  "Cancel this. Cancel it. Walk away. Big-league mistake otherwise.",
  "Listen to your gut. Cancel. Live to not-get-scammed another day, you know what I mean.",
  "Don't do it. Just don't. Cancel and we'll talk later. Maybe.",
  "Hit cancel. Hit it hard. Trust me. Nobody cancels better than you.",
];

const CLOSERS_MED = [
  "If anything feels off, cancel. Verify on the real channels. Be smart for once.",
  "Cancel first, ask questions later. Trust me on this one.",
  "Hit cancel. Check the real site. Then come back. Maybe.",
];

const CLOSERS_LOW = [
  "Take a breath. If it still looks fine, you can go. Or don't. Up to you, big guy.",
  "Quick gut check. Then proceed. Or cancel. Not my money.",
];

function seededPick<T>(arr: readonly T[], seed: string, salt: string): T {
  let h = 0;
  const s = seed + salt;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

function ageWord(days: number): string {
  if (days <= 0) return 'literally hours old. Hours. Folks';
  if (days === 1) return 'one day old. ONE DAY';
  if (days < 7) return `${days} days old. Brand new`;
  if (days < 30) return `${days} days old — barely a month, frankly`;
  return `${days} days old`;
}

type LineBuilder = (f: RiskFinding) => string;

const RULE_LINES: Record<string, LineBuilder> = {
  large_transfer: (f) => {
    const sol = (f.evidence?.sol as number | undefined) ?? null;
    return sol != null
      ? `it's sending ${sol} SOL out the door. ${sol} SOL! Tremendous amount. Huge`
      : "it's a huge transfer. Tremendous. Way too much, believe me";
  },
  unlimited_approval: () =>
    "it wants UNLIMITED access to your tokens. Unlimited. All of them. Anytime. Forever. That's insane, that's nuts",
  unverified_program: () =>
    "the program is unverified. Nobody knows what it does. Could be anything. Probably bad. Probably very bad",
  complex_transaction: (f) => {
    const n = (f.evidence?.count as number | undefined) ?? null;
    return n != null
      ? `it's hitting ${n} different programs in one shot. ${n}! Why does it need so many? Suspicious. Very suspicious`
      : "it's juggling a bunch of programs at once. Sketchy";
  },
  fake_token_name: () =>
    "that token name is FAKE. It's pretending to be a real one. It's not real, folks. Total knockoff",
  wallet_age: (f) => {
    const days = (f.evidence?.walletAgeDays as number | undefined) ?? null;
    return days != null
      ? `the address you'd be trusting is ${ageWord(days)}. Brand new wallets doing big moves — classic scam pattern. Classic`
      : "the address is brand new. Suspicious";
  },
  no_prior_interaction: () =>
    "you've never touched this address before. Ever. Total stranger. Strangers don't deserve your money, folks",
  scam_reports: (f) => {
    const count = (f.evidence?.count as number | undefined) ?? null;
    if (count != null && count >= 5) {
      return `${count} different people already reported this as a scam on Chainabuse. ${count}! They got screwed already. Don't be next`;
    }
    if (count != null && count > 0) {
      return "somebody already reported this address as a scam on Chainabuse. They got burned. Listen to them";
    }
    return "this address has scam reports against it. Reported. By people. Not great";
  },
  domain_age: (f) => {
    const days = (f.evidence?.domainAgeDays as number | undefined) ?? null;
    const domain = (f.evidence?.domain as string | undefined) ?? "this site";
    return days != null
      ? `${domain} was registered ${ageWord(days)}. Brand-new website. Nobody legit launches a brand new site for a real project. Nobody`
      : `${domain} is a brand-new website. Yellow flag right there`;
  },
  fake_domain_pattern: (f) => {
    const domain = (f.evidence?.domain as string | undefined) ?? "the site";
    return `${domain} is a fake. Look at the spelling. It's a knockoff, folks. Like a fake Rolex but for stealing your wallet`;
  },
  phishing_message: () =>
    "the message they want you to sign? Phishing language. Straight from the playbook. They're trying to scam you. It's obvious. Very obvious",
  transfer_above_baseline: (f) => {
    const mult = (f.evidence?.multiple as number | undefined) ?? null;
    return mult != null
      ? `this is ${mult} times bigger than your usual transfer. ${mult}X! Way too big, frankly`
      : "this is way bigger than what you normally send. Way bigger";
  },
  unfamiliar_counterparty: () =>
    "you've never sent anything to this address. First date. Bad first date energy",
  unfamiliar_protocol: () =>
    "you've never used this program before. Why start now? With this one? Bad timing",
  off_hours_signing: (f) => {
    const hour = (f.evidence?.hourUtc as number | undefined) ?? null;
    return hour != null
      ? `it's ${String(hour).padStart(2, '0')}:00 UTC. Way past your bedtime, partner. Scammers love it when you're tired`
      : "you're signing at a weird hour. Suspicious";
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
  sessionId = 'default',
): string {
  if (findings.length === 0) {
    return "Looks clean. You can sign. Probably fine, who knows.";
  }

  const ordered = [...findings].sort((a, b) => b.points - a.points);
  const top = ordered.slice(0, 3);

  const opener = seededPick(
    score >= 80 ? OPENERS_HIGH : score >= 60 ? OPENERS_MED : OPENERS_LOW,
    sessionId,
    'opener',
  );
  const closer = seededPick(
    score >= 80 ? CLOSERS_HIGH : score >= 60 ? CLOSERS_MED : CLOSERS_LOW,
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

  async generate(script: string, _sessionId: string): Promise<Buffer> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.ELEVENLABS_VOICE_ID}`;
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
      const body = await res.text().catch(() => '');
      throw new Error(`ElevenLabs TTS failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }
}

export const voiceProvider: VoiceProvider = new TTSVoiceProvider();
