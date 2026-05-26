import Studio from '../../../components/views/Studio';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ jobId: string }>;
}

export default async function StudioPage({ params }: PageProps) {
  const { jobId } = await params;
  return <Studio jobId={jobId} />;
}
