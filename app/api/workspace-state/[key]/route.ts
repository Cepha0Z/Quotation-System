import { getDatabase } from '@/db';

export const dynamic = 'force-dynamic';

const VALID_KEYS = new Set([
  'projects',
  'rate-card',
  'firm-settings',
  'revisions',
]);
const MAX_VALUE_BYTES = 8 * 1024 * 1024;

function validKey(key: string) {
  return VALID_KEYS.has(key);
}

function storageError(error: unknown) {
  console.error('Shared workspace storage failed', error);
  return Response.json(
    { error: 'The shared workspace is temporarily unavailable.' },
    { status: 503 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!validKey(key))
    return Response.json(
      { error: 'Unknown workspace record.' },
      { status: 404 },
    );

  try {
    const row = await getDatabase()
      .prepare('SELECT value FROM workspace_state WHERE key = ?1')
      .bind(key)
      .first<{ value: string }>();
    if (!row) return Response.json({ found: false });
    return Response.json({ found: true, value: JSON.parse(row.value) });
  } catch (error) {
    return storageError(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!validKey(key))
    return Response.json(
      { error: 'Unknown workspace record.' },
      { status: 404 },
    );

  try {
    const payload = (await request.json()) as { value?: unknown };
    if (!Object.prototype.hasOwnProperty.call(payload, 'value'))
      return Response.json({ error: 'A value is required.' }, { status: 400 });
    const value = JSON.stringify(payload.value);
    if (new TextEncoder().encode(value).byteLength > MAX_VALUE_BYTES)
      return Response.json(
        { error: 'This workspace record is too large.' },
        { status: 413 },
      );

    await getDatabase()
      .prepare(
        `INSERT INTO workspace_state (key, value, version, updated_at)
         VALUES (?1, ?2, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           version = workspace_state.version + 1,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(key, value)
      .run();
    return Response.json({ saved: true });
  } catch (error) {
    return storageError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!validKey(key))
    return Response.json(
      { error: 'Unknown workspace record.' },
      { status: 404 },
    );

  try {
    await getDatabase()
      .prepare('DELETE FROM workspace_state WHERE key = ?1')
      .bind(key)
      .run();
    return Response.json({ deleted: true });
  } catch (error) {
    return storageError(error);
  }
}
