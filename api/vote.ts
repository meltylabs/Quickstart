import { kv } from '@vercel/kv';

export default async function handler(req: any, res: any) {
  // GET /api/vote?id={shareId} — fetch vote data
  if (req.method === 'GET') {
    const { id } = req.query as { id?: string };
    if (!id) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    const data = await kv.hgetall(`vote:${id}`);
    if (!data) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.status(200).json({
      imageDataUrl: data.imageDataUrl,
      itemName: data.itemName,
      cop: Number(data.cop ?? 0),
      drop: Number(data.drop ?? 0),
    });
    return;
  }

  // POST /api/vote — record a vote
  if (req.method === 'POST') {
    const { shareId, vote } = req.body as { shareId?: string; vote?: string };

    if (!shareId || (vote !== 'cop' && vote !== 'drop')) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }

    // Rate limit: one vote per IP per share, 10-minute window
    const ip = ((req.headers['x-forwarded-for'] as string) ?? '')
      .split(',')[0]
      .trim() || req.socket?.remoteAddress || 'unknown';

    const lockKey = `vote-lock:${ip}:${shareId}`;
    const acquired = await kv.set(lockKey, 1, { ex: 600, nx: true });
    if (!acquired) {
      res.status(429).json({ error: 'Already voted' });
      return;
    }
    await kv.hincrby(`vote:${shareId}`, vote, 1);

    const data = await kv.hgetall(`vote:${shareId}`);
    res.status(200).json({
      imageDataUrl: data?.imageDataUrl,
      itemName: data?.itemName,
      cop: Number(data?.cop ?? 0),
      drop: Number(data?.drop ?? 0),
    });
    return;
  }

  res.status(405).end();
}
