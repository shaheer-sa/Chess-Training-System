import React, { useState, useEffect, useRef } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { Exercise } from '../training/exercises.js';
import { Board } from '../components/Board.js';
import { ResultPanel } from '../components/ResultPanel.js';
import { Chess, fen as fenOps } from 'chessops';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { MoveClassification, Result } from '../../engine/types.js';
import { appendRecord, generateSessionId, getAllRecords } from '../training/records.js';
import { getStepText } from '../shared/exchange.js';
import { ExchangeControls } from '../shared/ExchangeControls.js';
import { LabelIcon } from '../components/LabelIcon.js';

interface TrainingScreenProps {
  engineClient: EngineClient;
  exercises: Exercise[];
  onExit: () => void;
  onTrainAgain?: () => void;
}

export default function TrainingScreen({ engineClient, exercises, onExit, onTrainAgain }: TrainingScreenProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionId] = useState(() => generateSessionId());
  
  const [loading, setLoading] = useState(true);
  const [engineError, setEngineError] = useState(false);
  const [result, setResult] = useState<MoveClassification | null>(null);
  const [loadedExerciseKey, setLoadedExerciseKey] = useState<string | null>(null);
  
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<'low'|'medium'|'high'|null>(null);
  
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(1);
  const [startTime, setStartTime] = useState<number>(0);
  
  const [expandedLevel, setExpandedLevel] = useState(1);
  const [exchangeStep, setExchangeStep] = useState(0);
  
  const [userFlipped, setUserFlipped] = useState<boolean | null>(null);

  const submittingRef = useRef(false);
  const prefetchCache = useRef<Record<string, Promise<Result<MoveClassification>>>>({});
  const currentKeyRef = useRef<string | null>(null);
  const requestTokenRef = useRef(0);

  const currentEx = exercises[currentIndex];
  const isComplete = currentIndex >= exercises.length;

  const loadExercise = (index: number) => {
    if (index >= exercises.length) return;
    const ex = exercises[index];
    const key = `${ex.id}-${ex.fen}-${ex.from}-${ex.to}`;

    if (!prefetchCache.current[key]) {
      const p = engineClient.classifyMove(ex.fen, { from: ex.from, to: ex.to, promotion: ex.promotion as import("../../engine/index.js").Role | undefined });
      prefetchCache.current[key] = p;
      p.catch(() => {});
    }

    if (index === currentIndex || currentKeyRef.current === key) {
      setLoading(true);
      setEngineError(false);
      requestTokenRef.current += 1;
      
      const myToken = requestTokenRef.current;
      prefetchCache.current[key].then(res => {
        if (requestTokenRef.current !== myToken) return;
        
        if (res.ok) {
          setResult(res.value);
          setLoadedExerciseKey(key);
          setLoading(false);
          setStartTime(Date.now());
        } else {
          setEngineError(true);
          setLoading(false);
        }
      }).catch(() => {
        if (requestTokenRef.current !== myToken) return;
        setEngineError(true);
        setLoading(false);
      });
    }
  };

  useEffect(() => {
    return () => {
      requestTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (isComplete) return;
    const ex = exercises[currentIndex];
    currentKeyRef.current = `${ex.id}-${ex.fen}-${ex.from}-${ex.to}`;
    
    requestTokenRef.current += 1;
    loadExercise(currentIndex);
    
  }, [currentIndex, isComplete]);

  if (isComplete) {
    const sessionRecords = getAllRecords().filter(r => r.sessionId === sessionId);
    
    const firstAttempts = exercises.map(ex => sessionRecords.find(r => r.exerciseId === ex.id && r.attempt === 1)).filter(Boolean) as import("../training/records.js").TrainingRecord[];
    
    const c = firstAttempts.filter(r => r.correct === true).length;
    const n = firstAttempts.filter(r => r.answer === 'not_sure').length;
    const g = firstAttempts.filter(r => r.answer !== 'not_sure').length;

    const handleDownload = () => {
      const data = JSON.stringify(getAllRecords(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cts-training-records.json';
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div style={{ padding: '40px 24px', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <h2 style={{ fontSize: '2rem', margin: 0 }}>Session Complete</h2>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ background: 'var(--panel)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{c} of {g}</div>
            <div style={{ color: 'var(--text-muted)' }}>correct</div>
          </div>
          <div style={{ background: 'var(--panel)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{n}</div>
            <div style={{ color: 'var(--text-muted)' }}>not sure</div>
          </div>
        </div>
        
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {firstAttempts.map((r, i) => {
            const answerLabel = r.answer === 'not_sure' ? 'Not sure' : (BADGE_INFO[r.answer as keyof typeof BADGE_INFO]?.text ?? r.answer);
            const grade = r.correct === true ? 'Correct' : r.answer === 'not_sure' ? 'Not graded' : 'Not quite';
            const correctLabel = BADGE_INFO[r.correctLabel as keyof typeof BADGE_INFO]?.text ?? r.correctLabel;
            return (
              <li key={i} style={{ background: 'var(--panel)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{i + 1}. {answerLabel} — {grade}</span>
                <span style={{ color: 'var(--text-muted)' }}>(answer: {correctLabel})</span>
              </li>
            );
          })}
        </ul>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={onExit} style={{ background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border-strong)', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Home</button>
          <button onClick={onTrainAgain || onExit} style={{ background: 'var(--accent-btn)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Train again</button>
          <button onClick={handleDownload} style={{ background: 'transparent', color: 'var(--accent-text)', border: 'none', padding: '12px 24px', cursor: 'pointer', textDecoration: 'underline' }}>Download my results</button>
        </div>
      </div>
    );
  }

  const setup = fenOps.parseFen(currentEx.fen);
  const position = setup.isOk ? Chess.fromSetup(setup.unwrap()).unwrap() : null;
  const isBlackTurn = position?.turn === 'black';
  const displayFlipped = userFlipped !== null ? userFlipped : isBlackTurn;
  
  let questionText = 'What happens?';
  if (!setup.isOk) {
    questionText = `Invalid FEN: ${currentEx.fen}`;
  } else if (position) {
    const fromIdx = (currentEx.from.charCodeAt(1) - 49) * 8 + (currentEx.from.charCodeAt(0) - 97);
    const piece = position.board.get(fromIdx);
    if (piece) {
      const color = piece.color === 'white' ? 'White' : 'Black';
      const promo = currentEx.promotion ? ` and promotes to a ${currentEx.promotion}` : '';
      questionText = `${color} plays ${piece.role} ${currentEx.from}→${currentEx.to}${promo}. What happens?`;
    }
  }

  const handleSubmit = () => {
    if (!selectedAnswer || !result || submittingRef.current) return;
    submittingRef.current = true;
    
    const msToAnswer = Date.now() - startTime;
    const isCorrect = selectedAnswer === 'not_sure' ? null : selectedAnswer === result.label;
    
    appendRecord({
      sessionId,
      exerciseId: currentEx.id,
      attempt,
      answer: selectedAnswer as "safe" | "even_trade" | "loses_material" | "unclear" | "not_sure",
      confidence,
      correctLabel: result.label,
      correct: isCorrect,
      msToAnswer,
      timestamp: new Date().toISOString()
    });
    
    setSubmitted(true);
    if (currentIndex + 1 < exercises.length) {
      loadExercise(currentIndex + 1);
    }
  };

  const handleTryAgain = () => {
    setAttempt(a => a + 1);
    setSelectedAnswer(null);
    setConfidence(null);
    setSubmitted(false);
    setExpandedLevel(1);
    setExchangeStep(0);
    setStartTime(Date.now());
    submittingRef.current = false;
  };

  const handleNext = () => {
    requestTokenRef.current += 1;
    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    
    setResult(null);
    setSelectedAnswer(null);
    setConfidence(null);
    setSubmitted(false);
    setAttempt(1);
    setExpandedLevel(1);
    setExchangeStep(0);
    setUserFlipped(null);
    submittingRef.current = false;
    setLoading(true);
    setLoadedExerciseKey(null);
    
    if (nextIndex < exercises.length) {
      const nextEx = exercises[nextIndex];
      currentKeyRef.current = `${nextEx.id}-${nextEx.fen}-${nextEx.from}-${nextEx.to}`;
    }
  };

  let feedback = '';
  if (submitted && result) {
    if (selectedAnswer === 'not_sure') feedback = 'Not graded';
    else if (selectedAnswer === result.label) feedback = 'Correct';
    else {
      const chosenLabel = Object.keys(BADGE_INFO).includes(selectedAnswer!) 
        ? BADGE_INFO[selectedAnswer as keyof typeof BADGE_INFO].text 
        : selectedAnswer;
      feedback = `Not quite — you chose ${chosenLabel}`;
    }
  }

  let liveAnnouncement = '';
  if (submitted && result && expandedLevel >= 3 && exchangeStep > 0) {
    liveAnnouncement = getStepText(result, exchangeStep);
  }

  const handleRetryLoad = () => {
    const key = `${currentEx.id}-${currentEx.fen}-${currentEx.from}-${currentEx.to}`;
    delete prefetchCache.current[key]; // force fresh request
    requestTokenRef.current += 1;
    loadExercise(currentIndex);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#4a148c', color: '#fff', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
        <span>TRAINING · Exercise {currentIndex + 1} of {exercises.length} · Answer hidden until you submit</span>
        <button onClick={onExit} style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>Exit Training</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: '1320px', margin: '0 auto', width: '100%', padding: '24px 0' }}>
        <div style={{ flex: '1 1 400px', maxWidth: '640px', padding: '0 24px', display: 'flex', flexDirection: 'column' }}>
          {!loading && !engineError && loadedExerciseKey === `${currentEx.id}-${currentEx.fen}-${currentEx.from}-${currentEx.to}` && (
            <>
              <div style={{ alignSelf: 'flex-end', marginBottom: '8px' }}>
                <button 
                  onClick={() => setUserFlipped(!displayFlipped)}
                  style={{ background: 'var(--bg-sunken)', color: 'var(--text)', border: '1px solid var(--border-strong)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  Flip Board
                </button>
              </div>
              {expandedLevel >= 3 && exchangeStep > 0 && submitted && result?.exchange && (
                <div style={{ textAlign: 'center', marginBottom: '12px', fontWeight: 600, color: 'var(--text-2)' }}>
                  Showing the exchange — step {exchangeStep} of {result.exchange.bestLine.length}
                </div>
              )}
              {position && (
                <Board
                  position={position}
                  flipped={displayFlipped}
                  selectedSquare={null}
                  destinationSquare={null}
                  moves={[]}
                  expandedLevel={expandedLevel}
                  exchangeStep={exchangeStep}
                  selectedDestInfo={submitted ? result : null}
                  readOnly={true}
                  arrow={!submitted ? { from: currentEx.from, to: currentEx.to } : null}
                />
              )}
              {submitted && (
                 <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                    <ExchangeControls
                      expandedLevel={expandedLevel}
                      exchangeStep={exchangeStep}
                      setExchangeStep={setExchangeStep}
                      selectedDestInfo={result}
                      nextLabel="Next step"
                      prevLabel="Prev step"
                    />
                 </div>
              )}
            </>
          )}
        </div>

        <div style={{ flex: '1 1 300px', padding: '0 24px' }}>
          {loading || (!engineError && loadedExerciseKey !== `${currentEx.id}-${currentEx.fen}-${currentEx.from}-${currentEx.to}`) ? (
            <h2 style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>Loading exercise…</h2>
          ) : engineError ? (
            <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <h2 role="status" aria-live="polite" style={{ fontSize: '1.25rem', marginBottom: '16px' }}>An error occurred while loading this exercise.</h2>
              <button 
                onClick={handleRetryLoad}
                style={{ background: 'var(--accent-btn)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              >
                Retry
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h2 style={{ fontSize: '1.5rem', margin: 0 }}>
                <span role="status" aria-live="polite">
                  <span>{submitted ? feedback : questionText}</span>
                  {liveAnnouncement && (
                    <span className="sr-only">
                      {liveAnnouncement}
                    </span>
                  )}
                </span>
              </h2>
              
              {!submitted && (
                <div style={{ background: 'var(--panel)', padding: '24px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div role="radiogroup" aria-label="Your prediction" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(BADGE_INFO).map(([key, info]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: selectedAnswer === key ? 'var(--panel-hover)' : 'var(--bg-sunken)', border: selectedAnswer === key ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="prediction"
                          value={key}
                          checked={selectedAnswer === key}
                          onChange={() => setSelectedAnswer(key)}
                          style={{ margin: 0 }}
                        />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: info.color }}><LabelIcon kind={key as 'safe'|'even_trade'|'loses_material'|'unclear'} /></span>
                          {info.text}
                        </span>
                      </label>
                    ))}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: selectedAnswer === 'not_sure' ? 'var(--panel-hover)' : 'var(--bg-sunken)', border: selectedAnswer === 'not_sure' ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', marginTop: '8px' }}>
                      <input
                        type="radio"
                        name="prediction"
                        value="not_sure"
                        checked={selectedAnswer === 'not_sure'}
                        onChange={() => setSelectedAnswer('not_sure')}
                        style={{ margin: 0 }}
                      />
                      Not sure
                    </label>
                  </div>

                  {selectedAnswer && (
                    <div style={{ marginTop: '24px' }}>
                      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                        <legend style={{ fontWeight: 600, marginBottom: '12px', color: 'var(--text-2)' }}>Confidence (optional):</legend>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {['Low', 'Medium', 'High'].map(lvl => {
                            const val = lvl.toLowerCase() as "low" | "medium" | "high";
                            return (
                              <label key={lvl} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', background: confidence === val ? 'var(--panel-hover)' : 'var(--bg-sunken)', border: confidence === val ? '1px solid var(--accent)' : '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name="confidence"
                                  value={val}
                                  checked={confidence === val}
                                  onChange={() => setConfidence(val)}
                                  className="sr-only"
                                />
                                {lvl}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    </div>
                  )}

                  <button 
                    onClick={handleSubmit} 
                    disabled={!selectedAnswer}
                    style={{ marginTop: '24px', width: '100%', padding: '14px', background: selectedAnswer ? 'var(--accent-btn)' : 'var(--bg)', color: selectedAnswer ? '#fff' : 'var(--text-muted)', border: selectedAnswer ? 'none' : '1px solid var(--border-strong)', borderRadius: '6px', cursor: selectedAnswer ? 'pointer' : 'default', fontWeight: 600, fontSize: '1.05rem' }}
                  >
                    Submit
                  </button>
                </div>
              )}

              {submitted && result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <ResultPanel
                    selectedDestInfo={result}
                    expandedLevel={expandedLevel}
                    setExpandedLevel={setExpandedLevel}
                    exchangeStep={exchangeStep}
                    setExchangeStep={setExchangeStep}
                    stepText={getStepText(result, exchangeStep)}
                  />

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      onClick={handleNext} 
                      style={{ flex: 1, padding: '14px', background: 'var(--accent-btn)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '1.05rem' }}
                    >
                      Next
                    </button>
                    <button 
                      onClick={handleTryAgain} 
                      style={{ flex: 1, padding: '14px', background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '1.05rem' }}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
