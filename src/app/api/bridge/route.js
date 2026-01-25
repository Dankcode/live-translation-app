import { NextResponse } from 'next/server';

// In-memory store for the bridge data
let sharedData = {
    original: '',
    translated: '',
    timestamp: Date.now()
};

export async function GET() {
    return NextResponse.json(sharedData);
}

export async function POST(request) {
    try {
        const data = await request.json();

        // Update the shared store
        sharedData = {
            original: data.original || '',
            translated: data.translated || '',
            timestamp: Date.now()
        };

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
}
