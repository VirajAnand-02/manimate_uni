import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GENERATIONS_DIR = path.join(process.cwd(), 'generations');

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const videoPath = path.join(GENERATIONS_DIR, jobId, 'video.mp4');

  try {
    // Use async stat to check existence and get file size
    let stat;
    try {
      stat = await fsp.stat(videoPath);
    } catch {
      return new Response('Video not found', { status: 404 });
    }

    const fileSize = stat.size;
    const range = request.headers.get('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const nodeStream = fs.createReadStream(videoPath, { start, end });
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return new Response(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': 'video/mp4',
        },
      });
    } else {
      const nodeStream = fs.createReadStream(videoPath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;

      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Disposition': `inline; filename="manimate_${jobId.slice(0, 8)}.mp4"`,
        },
      });
    }
  } catch (err) {
    console.error('Error streaming video:', err);
    return new Response('Error streaming video', { status: 500 });
  }
}
