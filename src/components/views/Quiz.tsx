"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle, ArrowLeft, ArrowRight, Award, Check, Loader2, RefreshCw, SkipForward, X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Card from '../ui/Card';
import Button from '../ui/Button';

interface Question {
  id: string;
  question: string;
  options: { id: string; label: string }[];
  correctOption: string;
  explanation: string;
  userResponse: string | null;
  isCorrect: boolean | null;
}

interface QuizData {
  difficultyLevel: number;
  questions: Question[];
}

interface QuizProps {
  jobId?: string;
}

/** Concentric arcs whose sweep encodes the score — same drafting vocabulary. */
function ScoreDial({ accuracy }: { accuracy: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const tone = accuracy >= 80 ? 'text-signal-400' : accuracy >= 50 ? 'text-amber-400' : 'text-alert-400';

  return (
    <div className="relative h-[140px] w-[140px] shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-ink-800" />
        <motion.circle
          cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
          className={tone}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (accuracy / 100) * c }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
        <circle cx="64" cy="64" r={r - 12} fill="none" stroke="currentColor" strokeWidth="1"
          strokeDasharray="3 6" className="text-ink-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`numeric font-display text-[38px] leading-none ${tone}`}>{accuracy}%</span>
        <span className="label mt-1">accuracy</span>
      </div>
    </div>
  );
}

export default function Quiz({ jobId }: QuizProps) {
  const router = useRouter();
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timer state
  const [elapsed, setElapsed] = useState(0);

  // Fetch quiz on mount
  useEffect(() => {
    if (!jobId) {
      setError('No lecture specified. Open a quiz from the Studio.');
      setLoading(false);
      return;
    }
    const fetchQuiz = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/generate/${jobId}/quiz`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load quiz');
        }
        const data = await res.json();
        setQuizData(data);

        // Find the first unanswered question to start there
        const unansweredIdx = data.questions.findIndex((q: Question) => q.userResponse === null);
        if (unansweredIdx !== -1) {
          setCurrentIdx(unansweredIdx);
        } else {
          setCurrentIdx(data.questions.length);
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'An error occurred while loading the quiz');
      } finally {
        setLoading(false);
      }
    };

    fetchQuiz();
  }, [jobId]);

  // Quiz timer
  useEffect(() => {
    if (loading || currentIdx >= (quizData?.questions.length || 0)) return;
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, currentIdx, quizData]);

  // Sync selection if question was already answered
  useEffect(() => {
    if (!quizData) return;
    const currentQuestion = quizData.questions[currentIdx];
    if (currentQuestion && currentQuestion.userResponse !== null) {
      setSelectedOption(currentQuestion.userResponse === 'skipped' ? null : currentQuestion.userResponse);
      setShowFeedback(true);
    } else {
      setSelectedOption(null);
      setShowFeedback(false);
    }
  }, [quizData, currentIdx]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const persist = async (payload: QuizData) => {
    try {
      await fetch(`/api/generate/${jobId}/quiz`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Failed to sync quiz progress:', err);
    }
  };

  const handleSelectOption = (optionId: string) => {
    if (showFeedback) return;
    setSelectedOption(optionId);
  };

  const handleConfirmAnswer = async () => {
    if (!quizData || !selectedOption || showFeedback) return;

    const updatedQuestions = [...quizData.questions];
    const currentQuestion = { ...updatedQuestions[currentIdx] };

    currentQuestion.isCorrect = selectedOption === currentQuestion.correctOption;
    currentQuestion.userResponse = selectedOption;
    updatedQuestions[currentIdx] = currentQuestion;

    const newQuizData = { ...quizData, questions: updatedQuestions };
    setQuizData(newQuizData);
    setShowFeedback(true);
    await persist(newQuizData);
  };

  const handleSkip = async () => {
    if (!quizData || showFeedback) return;

    const updatedQuestions = [...quizData.questions];
    const currentQuestion = { ...updatedQuestions[currentIdx] };

    currentQuestion.userResponse = 'skipped';
    currentQuestion.isCorrect = false;
    updatedQuestions[currentIdx] = currentQuestion;

    const newQuizData = { ...quizData, questions: updatedQuestions };
    setQuizData(newQuizData);
    setShowFeedback(true);
    await persist(newQuizData);
  };

  const handleNext = () => {
    setCurrentIdx((prev) => prev + 1);
  };

  const handleGenerateMore = async () => {
    if (!quizData || generatingMore) return;

    try {
      setGeneratingMore(true);
      const res = await fetch(`/api/generate/${jobId}/quiz`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate questions');
      }
      const data = await res.json();
      const newQuestionIndex = quizData.questions.length;
      setQuizData(data);
      setCurrentIdx(newQuestionIndex);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to generate additional questions');
    } finally {
      setGeneratingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
        <p className="text-sm text-chalk-400">Preparing your questions…</p>
      </div>
    );
  }

  if (error || !quizData) {
    return (
      <Card className="mx-auto max-w-lg px-8 py-16 text-center">
        <AlertCircle className="mx-auto h-7 w-7 text-amber-400" />
        <h3 className="mt-4 font-display text-2xl text-chalk-100">Quiz unavailable</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-chalk-400">
          {error || 'Could not fetch quiz questions.'}
        </p>
        <div className="mt-6 flex justify-center">
          <Button variant="outline" icon={ArrowLeft} onClick={() => router.push(`/studio/${jobId}`)}>
            Back to Studio
          </Button>
        </div>
      </Card>
    );
  }

  const questions = quizData.questions;
  const isFinished = currentIdx >= questions.length;

  // ─── Summary ──────────────────────────────────────────────────
  if (isFinished) {
    const total = questions.length;
    const answeredCount = questions.filter((q) => q.userResponse !== null && q.userResponse !== 'skipped').length;
    const correctCount = questions.filter((q) => q.isCorrect === true).length;
    const skippedCount = questions.filter((q) => q.userResponse === 'skipped').length;
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-10">
        <Card className="p-6 md:p-8">
          <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center">
            <ScoreDial accuracy={accuracy} />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-300">
                <Award className="h-3 w-3" />
                Level {quizData.difficultyLevel}
              </span>
              <h2 className="mt-3 font-display text-[32px] leading-tight text-chalk-100">
                {accuracy >= 80 ? 'Strong grasp' : accuracy >= 50 ? 'Getting there' : 'Worth another pass'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-chalk-400">
                {correctCount} of {answeredCount} answered correctly
                {skippedCount > 0 && <> · {skippedCount} skipped</>} · {total} questions total.
              </p>

              <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Button variant="outline" icon={ArrowLeft} onClick={() => router.push(`/studio/${jobId}`)}>
                  Back to Studio
                </Button>
                <Button
                  onClick={handleGenerateMore}
                  disabled={generatingMore}
                  icon={generatingMore ? Loader2 : RefreshCw}
                  className={generatingMore ? '[&>svg]:animate-spin' : ''}
                >
                  {generatingMore ? 'Writing questions…' : 'Harder round'}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Review */}
        <div className="space-y-3">
          <h3 className="font-display text-[22px] text-chalk-100">Review</h3>
          {questions.map((q, i) => {
            const skipped = q.userResponse === 'skipped';
            const correct = q.isCorrect === true;
            return (
              <Card key={q.id} variant="quiet" delay={i * 0.04} className="p-5">
                <div className="flex gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                      correct
                        ? 'border-signal-500/40 bg-signal-500/10 text-signal-400'
                        : skipped
                          ? 'border-ink-600 bg-ink-800 text-chalk-500'
                          : 'border-alert-500/40 bg-alert-500/10 text-alert-400'
                    }`}
                  >
                    {correct ? <Check className="h-3.5 w-3.5" /> : skipped ? <SkipForward className="h-3 w-3" /> : <X className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-relaxed text-chalk-200">{q.question}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-chalk-400">
                      <span className="text-chalk-500">Answer: </span>
                      {q.options.find((o) => o.id === q.correctOption)?.label ?? q.correctOption}
                    </p>
                    {q.explanation && (
                      <p className="mt-1.5 text-[13px] leading-relaxed text-chalk-500">{q.explanation}</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Question ─────────────────────────────────────────────────
  const question = questions[currentIdx];
  const progressPct = Math.round((currentIdx / questions.length) * 100);
  const wasSkipped = question.userResponse === 'skipped';

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      {/* Meta bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="numeric font-display text-[26px] leading-none text-chalk-100">
            {currentIdx + 1}
          </span>
          <span className="text-[13px] text-chalk-500">of {questions.length}</span>
        </div>
        <span className="numeric text-[13px] text-chalk-400">{formatTime(elapsed)}</span>
      </div>

      <div className="h-[3px] w-full overflow-hidden rounded-full bg-ink-800">
        <motion.div
          className="h-full rounded-full bg-amber-400"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="p-6 md:p-8" edge>
            <h2 className="font-display text-[26px] leading-snug text-chalk-100 md:text-[30px]">
              {question.question}
            </h2>

            <div className="mt-6 space-y-2.5">
              {question.options.map((opt, i) => {
                const isSelected = selectedOption === opt.id;
                const isCorrectOpt = opt.id === question.correctOption;

                let tone = 'border-ink-700 bg-ink-900/60 hover:border-ink-500 text-chalk-300';
                if (showFeedback) {
                  if (isCorrectOpt) tone = 'border-signal-500/50 bg-signal-500/10 text-signal-300';
                  else if (isSelected) tone = 'border-alert-500/50 bg-alert-500/10 text-alert-300';
                  else tone = 'border-ink-800 bg-ink-900/30 text-chalk-500';
                } else if (isSelected) {
                  tone = 'border-amber-400/60 bg-amber-400/10 text-chalk-100';
                }

                return (
                  <motion.button
                    key={opt.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    onClick={() => handleSelectOption(opt.id)}
                    disabled={showFeedback}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-default ${tone}`}
                  >
                    <span
                      className={`mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[12px] font-medium ${
                        showFeedback && isCorrectOpt
                          ? 'border-signal-500/50 text-signal-300'
                          : showFeedback && isSelected
                            ? 'border-alert-500/50 text-alert-300'
                            : isSelected
                              ? 'border-amber-400/60 text-amber-300'
                              : 'border-ink-600 text-chalk-500'
                      }`}
                    >
                      {showFeedback && isCorrectOpt ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : showFeedback && isSelected ? (
                        <X className="h-3.5 w-3.5" />
                      ) : (
                        String.fromCharCode(65 + i)
                      )}
                    </span>
                    <span className="text-[15px] leading-relaxed">{opt.label}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Feedback */}
            <AnimatePresence>
              {showFeedback && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div
                    className={`mt-5 rounded-xl border p-4 ${
                      question.isCorrect
                        ? 'border-signal-500/30 bg-signal-500/[0.07]'
                        : wasSkipped
                          ? 'border-ink-700 bg-ink-900/60'
                          : 'border-alert-500/30 bg-alert-500/[0.07]'
                    }`}
                  >
                    <p
                      className={`text-sm font-semibold ${
                        question.isCorrect ? 'text-signal-300' : wasSkipped ? 'text-chalk-300' : 'text-alert-300'
                      }`}
                    >
                      {question.isCorrect ? 'Correct' : wasSkipped ? 'Skipped' : 'Not quite'}
                    </p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-chalk-300">{question.explanation}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              {!showFeedback ? (
                <>
                  <Button variant="ghost" onClick={handleSkip}>Skip</Button>
                  <Button onClick={handleConfirmAnswer} disabled={!selectedOption} iconRight={ArrowRight}>
                    Check answer
                  </Button>
                </>
              ) : (
                <Button onClick={handleNext} iconRight={ArrowRight}>
                  {currentIdx === questions.length - 1 ? 'See results' : 'Next question'}
                </Button>
              )}
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
