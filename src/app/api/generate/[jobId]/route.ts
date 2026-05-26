import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { LocalMetadata } from '@/src/types/manimate';
import { cancelActiveJob } from '@/src/lib/manimate/activeJobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GENERATIONS_DIR = path.join(process.cwd(), 'generations');

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const metadataPath = path.join(GENERATIONS_DIR, jobId, 'metadata.json');

  try {
    const content = await fs.readFile(metadataPath, 'utf-8');
    return NextResponse.json(JSON.parse(content));
  } catch (err) {
    console.error('Get job details error:', err);
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { searchParams } = new URL(request.url);
  const discard = searchParams.get('discard') === 'true';

  const metadataPath = path.join(GENERATIONS_DIR, jobId, 'metadata.json');
  const jobDirPath = path.join(GENERATIONS_DIR, jobId);

  try {
    cancelActiveJob(jobId);

    if (discard) {
      await fs.rm(jobDirPath, { recursive: true, force: true });
      return new Response(null, { status: 204 });
    }

    const content = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(content) as LocalMetadata;

    // If job is already terminal, no-op
    if (metadata.status === 'completed' || metadata.status === 'failed') {
      return NextResponse.json(
        { message: `Job already ${metadata.status}` },
        { status: 200 }
      );
    }

    // Update local metadata
    metadata.status = 'failed';
    metadata.error = 'Job cancelled by user';
    metadata.finished_at = new Date().toISOString();
    metadata.updated_at = new Date().toISOString();
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('Cancel job error:', err);
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
}

