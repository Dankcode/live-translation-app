import { NextResponse } from 'next/server';
import { getMaskedUsage } from '@/lib/usage-tracker';

export async function GET() {
    try {
        const stats = getMaskedUsage();
        return NextResponse.json(stats);
    } catch (error) {
        console.error('[Usage API Error]:', error);
        return NextResponse.json({ error: 'Failed to fetch usage stats' }, { status: 500 });
    }
}
