"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Clock, Check, AlertCircle, RefreshCw, ChevronRight, X, ArrowLeft, Award, HelpCircle, Sparkles } from 'lucide-react';
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
      setError('No job specified. Please launch a quiz from the Studio.');
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
          // If all are answered, go to summary (index = length)
          setCurrentIdx(data.questions.length);
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'An error occurred while loading assessment');
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

  const handleSelectOption = (optionId: string) => {
    // Prevent changing answer if already confirmed
    if (showFeedback) return;
    setSelectedOption(optionId);
  };

  const handleConfirmAnswer = async () => {
    if (!quizData || !selectedOption || showFeedback) return;

    const updatedQuestions = [...quizData.questions];
    const currentQuestion = { ...updatedQuestions[currentIdx] };

    const isCorrect = selectedOption === currentQuestion.correctOption;
    currentQuestion.userResponse = selectedOption;
    currentQuestion.isCorrect = isCorrect;
    updatedQuestions[currentIdx] = currentQuestion;

    const newQuizData = {
      ...quizData,
      questions: updatedQuestions,
    };

    setQuizData(newQuizData);
    setShowFeedback(true);

    // Save progress to server
    try {
      await fetch(`/api/generate/${jobId}/quiz`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuizData),
      });
    } catch (err) {
      console.error('Failed to sync quiz progress:', err);
    }
  };

  const handleSkip = async () => {
    if (!quizData || showFeedback) return;

    const updatedQuestions = [...quizData.questions];
    const currentQuestion = { ...updatedQuestions[currentIdx] };

    currentQuestion.userResponse = 'skipped';
    currentQuestion.isCorrect = false;
    updatedQuestions[currentIdx] = currentQuestion;

    const newQuizData = {
      ...quizData,
      questions: updatedQuestions,
    };

    setQuizData(newQuizData);
    setShowFeedback(true);

    // Save progress to server
    try {
      await fetch(`/api/generate/${jobId}/quiz`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuizData),
      });
    } catch (err) {
      console.error('Failed to sync quiz progress:', err);
    }
  };

  const handleNext = () => {
    setCurrentIdx((prev) => prev + 1);
  };

  const handleGenerateMore = async () => {
    if (!quizData || generatingMore) return;

    try {
      setGeneratingMore(true);
      const res = await fetch(`/api/generate/${jobId}/quiz`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate questions');
      }
      const data = await res.json();
      setQuizData(data);
      
      // Move index to the first of the newly generated questions
      const newQuestionIndex = quizData.questions.length;
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
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-6">
        <RefreshCw className="w-10 h-10 text-brand-500 animate-spin" />
        <span className="text-zinc-500 font-mono text-xs uppercase tracking-[0.3em] animate-pulse">Initializing neural assessment...</span>
      </div>
    );
  }

  if (error || !quizData) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center max-w-lg mx-auto text-center space-y-6 px-4">
        <AlertCircle className="w-16 h-16 text-amber-500" />
        <div className="space-y-2">
          <h3 className="text-xl font-display font-bold text-white uppercase tracking-tight">Assessment Unavailable</h3>
          <p className="text-zinc-500 text-sm leading-relaxed">{error || 'Could not fetch quiz questions.'}</p>
        </div>
        <Button variant="outline" onClick={() => router.push(`/studio/${jobId}`)} className="border-white/10 text-zinc-300">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Studio
        </Button>
      </div>
    );
  }

  const questions = quizData.questions;
  const isFinished = currentIdx >= questions.length;

  // Finished assessment view
  if (isFinished) {
    const total = questions.length;
    const answeredCount = questions.filter((q) => q.userResponse !== null && q.userResponse !== 'skipped').length;
    const correctCount = questions.filter((q) => q.isCorrect === true).length;
    const skippedCount = questions.filter((q) => q.userResponse === 'skipped').length;
    const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

    return (
      <div className="max-w-4xl mx-auto space-y-10 pb-16">
        {/* Header card */}
        <div className="relative overflow-hidden rounded-2xl bg-zinc-950 border border-white/5 p-8 md:p-12 shadow-2xl">
          <div className="absolute inset-0 bg-grid opacity-[0.05] pointer-events-none" />
          <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-brand-600/10 to-transparent pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center shadow-2xl shadow-brand-500/40">
                  <Award className="text-white w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-3xl font-display font-black text-white tracking-tighter uppercase">Assessment Complete</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-brand-400">Mastery Level {quizData.difficultyLevel}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Button variant="outline" onClick={() => router.push(`/studio/${jobId}`)} className="border-white/10 text-zinc-300">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Studio
              </Button>
              <Button variant="primary" onClick={handleGenerateMore} disabled={generatingMore} className="bg-gradient-to-r from-brand-500 to-indigo-600 text-white font-bold uppercase tracking-wider">
                {generatingMore ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Synthesizing Harder Tier...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" /> Generate Harder Questions
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Card variant="solid" className="p-6 text-center border-white/5">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Total Questions</span>
            <span className="text-4xl font-display font-black text-white">{total}</span>
          </Card>
          <Card variant="solid" className="p-6 text-center border-white/5">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Correct Answers</span>
            <span className="text-4xl font-display font-black text-emerald-400">{correctCount}</span>
          </Card>
          <Card variant="solid" className="p-6 text-center border-white/5">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Skipped Questions</span>
            <span className="text-4xl font-display font-black text-amber-500">{skippedCount}</span>
          </Card>
          <Card variant="solid" className="p-6 text-center border-white/5">
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Concept Accuracy</span>
            <span className="text-4xl font-display font-black text-brand-400">{accuracy}%</span>
          </Card>
        </div>

        {/* Performance Breakdown */}
        <div className="space-y-4">
          <h3 className="text-lg font-display font-black text-white uppercase tracking-tight">Question Ledger</h3>
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <Card key={q.id} variant="solid" className="p-5 border-white/5 bg-zinc-950 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 pr-6">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-zinc-600 font-bold">#{idx + 1}</span>
                    <span className={`text-[8px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${
                      q.userResponse === 'skipped'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : q.isCorrect
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {q.userResponse === 'skipped' ? 'Skipped' : q.isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-zinc-300 leading-snug">{q.question}</h4>
                </div>
                <div className="text-left md:text-right min-w-[200px] border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                  <span className="text-[9px] text-zinc-600 uppercase tracking-widest block mb-1">Your Response</span>
                  <span className="text-xs font-mono font-bold text-zinc-400">
                    {q.userResponse === 'skipped'
                      ? 'Skipped'
                      : `${q.userResponse}: ${q.options.find((o) => o.id === q.userResponse)?.label || ''}`}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIdx];
  const isQuestionAnswered = currentQuestion.userResponse !== null;

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-16">
      {/* Quiz Progress & Timer Header */}
      <div className="relative overflow-hidden rounded-2xl bg-zinc-950 border border-white/5 p-6 md:p-8 shadow-2xl">
        <div className="absolute inset-0 bg-grid opacity-[0.05] pointer-events-none" />
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-brand-600/10 to-transparent pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push(`/studio/${jobId}`)}
              className="w-9 h-9 rounded-lg border border-white/5 bg-zinc-900 flex items-center justify-center hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <div>
              <h2 className="text-xl font-display font-black text-white tracking-tighter uppercase flex items-center gap-2">
                <Brain className="w-5 h-5 text-brand-500" /> Neural Assessment
              </h2>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-brand-400">Difficulty Tier {quizData.difficultyLevel}</span>
                <div className="w-1 h-1 rounded-full bg-zinc-700" />
                <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-zinc-500">Mastery Assessment</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Session Timer</span>
              <div className="flex items-center gap-2.5 text-lg font-mono font-black text-white bg-black px-4 py-2 rounded-xl border border-white/5 shadow-inner">
                <Clock className="w-4 h-4 text-brand-500" />
                <span>{formatTime(elapsed)}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-8 space-y-2">
          <div className="flex justify-between text-[8px] text-zinc-500 font-bold uppercase tracking-[0.3em] px-1">
            <span>Evaluation Sequence</span>
            <span className="text-brand-400">Question {currentIdx + 1} of {questions.length}</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
            <div 
              style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
              className="h-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-500 ease-out"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Core Question Layout */}
        <div className="lg:col-span-2 space-y-8">
          <div className="space-y-3">
            <span className="text-[8px] font-bold text-brand-500 uppercase tracking-[0.4em] flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" /> QUERY_NODE_0{currentIdx + 1}
            </span>
            <h2 className="text-xl md:text-2xl font-display font-extrabold text-white leading-snug tracking-tight">
              {currentQuestion.question}
            </h2>
          </div>

          {/* Options List */}
          <div className="space-y-3.5">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedOption === option.id;
              const isCorrectOpt = option.id === currentQuestion.correctOption;
              const isUserChoice = currentQuestion.userResponse === option.id;

              let style = 'bg-zinc-950 border-white/5 hover:border-white/10';
              if (showFeedback) {
                if (isCorrectOpt) {
                  style = 'bg-emerald-500/10 border-emerald-500/60 ring-2 ring-emerald-500/10 text-emerald-400';
                } else if (isUserChoice && !isCorrectOpt) {
                  style = 'bg-rose-500/10 border-rose-500/60 ring-2 ring-rose-500/10 text-rose-400';
                } else {
                  style = 'bg-zinc-950/40 border-white/5 opacity-50 cursor-not-allowed';
                }
              } else if (isSelected) {
                style = 'bg-brand-500/10 border-brand-500 ring-4 ring-brand-500/10';
              }

              return (
                <button
                  key={option.id}
                  onClick={() => handleSelectOption(option.id)}
                  disabled={showFeedback}
                  className={`w-full group relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-300 text-left overflow-hidden ${style}`}
                >
                  {isSelected && !showFeedback && (
                    <motion.div 
                      layoutId="selected-overlay"
                      className="absolute inset-0 bg-brand-500 opacity-[0.03]"
                    />
                  )}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-display font-black transition-all duration-300 relative z-10 ${
                    showFeedback
                      ? isCorrectOpt
                        ? 'bg-emerald-500 text-white'
                        : isUserChoice
                          ? 'bg-rose-500 text-white'
                          : 'bg-zinc-900 text-zinc-700'
                      : isSelected
                        ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                        : 'bg-zinc-900 text-zinc-500 group-hover:text-zinc-400'
                  }`}>
                    {option.id}
                  </div>
                  <span className={`text-sm font-bold tracking-tight relative z-10 transition-colors duration-300 ${
                    showFeedback
                      ? isCorrectOpt
                        ? 'text-white'
                        : isUserChoice
                          ? 'text-rose-400'
                          : 'text-zinc-600'
                      : isSelected
                        ? 'text-white'
                        : 'text-zinc-400 group-hover:text-zinc-300'
                  }`}>
                    {option.label}
                  </span>
                  
                  <div className="ml-auto relative z-10">
                    <div className={`w-5 h-5 rounded-md border-2 transition-all duration-300 flex items-center justify-center ${
                      showFeedback
                        ? isCorrectOpt
                          ? 'border-emerald-500 bg-emerald-500'
                          : isUserChoice
                            ? 'border-rose-500 bg-rose-500'
                            : 'border-zinc-800'
                        : isSelected
                          ? 'border-brand-500 bg-brand-500'
                          : 'border-zinc-800 group-hover:border-zinc-700'
                    }`}>
                      {showFeedback ? (
                        isCorrectOpt ? (
                          <Check className="w-3 h-3 text-white" />
                        ) : isUserChoice ? (
                          <X className="w-3 h-3 text-white" />
                        ) : null
                      ) : isSelected ? (
                        <Check className="w-3 h-3 text-white" />
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-4 pt-2">
            {!showFeedback ? (
              <>
                <Button 
                  variant="outline" 
                  size="lg" 
                  onClick={handleSkip}
                  className="flex-1 border-white/10 text-zinc-400 hover:bg-white/5 uppercase font-bold tracking-wider text-[10px] h-14"
                >
                  Skip Question
                </Button>
                <Button 
                  variant="primary" 
                  size="lg" 
                  onClick={handleConfirmAnswer}
                  disabled={!selectedOption}
                  className="flex-[2] h-14 text-sm font-black uppercase tracking-[0.2em] bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(54,169,247,0.3)]"
                >
                  Confirm Answer
                </Button>
              </>
            ) : (
              <Button 
                variant="primary" 
                size="lg" 
                onClick={handleNext}
                className="w-full h-14 text-sm font-black uppercase tracking-[0.2em] bg-gradient-to-r from-brand-500 to-indigo-600 flex items-center justify-center gap-2"
              >
                {currentIdx + 1 === questions.length ? 'Finish Evaluation' : 'Next Question'} <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Sidebar Feedback Panel */}
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {showFeedback ? (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="h-full"
              >
                <Card 
                  variant="solid" 
                  className={`p-6 border-2 h-full flex flex-col justify-between ${
                    currentQuestion.userResponse === 'skipped'
                      ? 'border-amber-500/20 bg-amber-950/5'
                      : currentQuestion.isCorrect
                        ? 'border-emerald-500/20 bg-emerald-950/5'
                        : 'border-rose-500/20 bg-rose-950/5'
                  }`}
                  glow="none"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-bold uppercase tracking-[0.3em] px-2 py-0.5 rounded-full ${
                        currentQuestion.userResponse === 'skipped'
                          ? 'bg-amber-500/10 text-amber-400'
                          : currentQuestion.isCorrect
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {currentQuestion.userResponse === 'skipped' ? 'Evaluation Skipped' : currentQuestion.isCorrect ? 'Evaluation Correct' : 'Evaluation Incorrect'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-base font-display font-black text-white uppercase tracking-tight flex items-center gap-2">
                        <Check className={`w-4 h-4 ${currentQuestion.isCorrect ? 'text-emerald-500' : 'text-zinc-500'}`} /> Core Analysis
                      </h4>
                      <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                        {currentQuestion.explanation}
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 pt-4 border-t border-white/5 text-[9px] font-mono text-zinc-600 uppercase tracking-widest">
                    Correct Option: {currentQuestion.correctOption}
                  </div>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <Card variant="glass" className="border-white/5 p-8 flex flex-col items-center justify-center text-center h-full min-h-[300px]" glow="none">
                  <div className="w-12 h-12 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-500 mb-4">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-display font-bold text-zinc-400 uppercase tracking-wider mb-2">Evaluation Awaiting</h4>
                  <p className="text-xs text-zinc-600 max-w-[200px] leading-relaxed">
                    Select an option and confirm your response to view structural analysis and logic breakdowns.
                  </p>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
