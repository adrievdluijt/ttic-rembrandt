// app/api/review/route.ts
//
// Server-side endpoint for review requests. The Anthropic API key is
// read from the ANTHROPIC_API_KEY environment variable and never
// touches the client.

import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/system-prompt';

const anthropic = new Anthropic();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { content, context } = body as {
      content?: unknown;
      context?: unknown;
    };

    if (typeof content !== 'string' || !content.trim()) {
      return Response.json(
        { error: 'Missing or invalid content' },
        { status: 400 }
      );
    }

    const safeContext = typeof context === 'string' ? context : '';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: buildSystemPrompt(safeContext),
      messages: [{ role: 'user', content }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { text: string }).text)
      .join('\n');

    return Response.json({ review: text });
  } catch (error) {
    console.error('Review API error:', error);
    return Response.json(
      { error: 'Review failed. Please try again.' },
      { status: 500 }
    );
  }
}
