import { NextResponse } from 'next/server';
import { buildWhisperJobPlan, getWhisperStatus, runWhisperJob } from '@/lib/whisper-cpp';

const SAMPLE_CUES = [
  {
    id: 'sample-1',
    start: 1.2,
    end: 4.4,
    original: 'We need to get the signal back before sunrise.',
    translation: '日の出までに信号を取り戻す必要があります。',
    reading: 'we need to get the signal back before sunrise',
    confidence: 0.93,
  },
  {
    id: 'sample-2',
    start: 4.8,
    end: 8.6,
    original: 'Listen closely, then repeat the line with the same rhythm.',
    translation: 'よく聞いてから、同じリズムでその文を繰り返しましょう。',
    reading: 'listen closely then repeat the line with the same rhythm',
    confidence: 0.91,
  },
  {
    id: 'sample-3',
    start: 9,
    end: 12.4,
    original: 'Every subtitle can become a loop, a card, or a quiz.',
    translation: 'すべての字幕はループ、カード、またはクイズになります。',
    reading: 'every subtitle can become a loop a card or a quiz',
    confidence: 0.9,
  },
];

export async function GET() {
  return NextResponse.json(getWhisperStatus());
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body.action || 'plan';

    if (action === 'sample') {
      return NextResponse.json({
        source: 'lingoloop-sample',
        mediaName: 'Tears of Steel sample smoke test',
        sourceLang: 'en',
        targetLang: 'ja',
        status: getWhisperStatus(),
        cues: SAMPLE_CUES,
      });
    }

    if (action === 'health') {
      return NextResponse.json(getWhisperStatus());
    }

    if (action === 'transcribe') {
      const result = await runWhisperJob(body);
      return NextResponse.json(result);
    }

    const plan = buildWhisperJobPlan(body);
    return NextResponse.json(plan);
  } catch (error) {
    const message = error?.message || 'whisper.cpp pipeline failed';
    const status = message.includes('not ready') || message.includes('required') ? 424 : 400;
    return NextResponse.json({ error: message, whisperStatus: getWhisperStatus() }, { status });
  }
}
