import Quiz from '@/src/components/views/Quiz';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ jobId: string }>;
}

export default async function QuizPage({ params }: PageProps) {
  const { jobId } = await params;
  return <Quiz jobId={jobId} />;
}
