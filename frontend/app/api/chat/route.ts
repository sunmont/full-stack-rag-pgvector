import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Extract the latest user prompt from the messages array to send to FastAPI
    const latestMessage = messages[messages.length - 1]?.content || '';

    const backendResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:8000'}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: latestMessage })
    });

    if (!backendResponse.ok || !backendResponse.body) {
      return NextResponse.json({ error: 'Backend AI engine communication failed' }, { status: 500 });
    }

    // Forward the streaming body directly to your frontend client
    return new Response(backendResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}