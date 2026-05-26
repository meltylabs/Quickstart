import { kv } from '@vercel/kv';
import { nanoid } from 'nanoid';

export const config = { maxDuration: 60 };

const FASHN_BASE = 'https://api.fashn.ai/v1';

interface RunBody {
  personBase64: string;
  garmentBase64: string;
  itemName: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const { personBase64, garmentBase64, itemName } = req.body as RunBody;

  if (!personBase64 || !garmentBase64 || !itemName?.trim()) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const apiKey = process.env.FASHN_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'FASHN_API_KEY not configured' });
    return;
  }

  // Submit generation job
  const runRes = await fetch(`${FASHN_BASE}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_image: personBase64,
      garment_image: garmentBase64,
      category: 'tops',
      mode: 'balanced',
    }),
  });

  if (!runRes.ok) {
    const body = await runRes.text();
    res.status(runRes.status).json({ error: `Fashn API error: ${body}` });
    return;
  }

  const { id } = await runRes.json() as { id: string };
  if (!id || typeof id !== 'string') {
    res.status(502).json({ error: 'Invalid response from Fashn API' });
    return;
  }

  // Poll for completion (max 60s: 30 × 2s)
  let outputUrl: string | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));

    const statusRes = await fetch(`${FASHN_BASE}/status/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!statusRes.ok) continue;
    const status = await statusRes.json() as {
      status: string;
      output?: string[];
      error?: string;
    };

    if (status.status === 'completed' && status.output?.[0]) {
      outputUrl = status.output[0];
      break;
    }
    if (status.status === 'failed') {
      res.status(500).json({ error: status.error || 'Generation failed' });
      return;
    }
  }

  if (!outputUrl) {
    res.status(504).json({ error: 'Generation timed out' });
    return;
  }

  // Fetch result image and encode as base64 data URL
  const imgRes = await fetch(outputUrl);
  if (!imgRes.ok) {
    res.status(502).json({ error: 'Failed to fetch generated image' });
    return;
  }
  const imgBuffer = await imgRes.arrayBuffer();
  const imageDataUrl = `data:image/jpeg;base64,${Buffer.from(imgBuffer).toString('base64')}`;

  // Persist in KV for vote page (7-day TTL to prevent storage exhaustion)
  const shareId = nanoid(10);
  await kv.hset(`vote:${shareId}`, {
    imageDataUrl,
    itemName: itemName.trim(),
    cop: 0,
    drop: 0,
  });
  await kv.expire(`vote:${shareId}`, 7 * 24 * 60 * 60);

  res.status(200).json({ imageDataUrl, shareId, itemName: itemName.trim() });
}
