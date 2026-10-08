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

  const currentEx = exercises[currentIndex];
  const isComplete = currentIndex >= exercises.length;

  const loadExercise = (index: number) => {
    if (index >= exercises.length) return;
    const ex = exercises[index];
    const key = `${ex.id}-${ex.fen}-${ex.from}-${ex.to}`;

    if (!prefetchCache.current[key]) {
      prefetchCache.current[key] = engineClient.classifyMove(ex.fen, { from: ex.from, to: ex.to, promotion: ex.promotion as any });
    }

    if (index === currentIndex || currentKeyRef.current === key) {
      setLoading(true);
      setEngineError(false);
      
      prefetchCache.current[key].then(res => {
        // Guard against stale resolution using the current active key
        if (currentKeyRef.current !== key) return;
        
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
        if (currentKeyRef.current !== key) return;
        setEngineError(true);
        setLoading(false);
      });
    }
  };

  useEffect(() => {
    if (isComplete) return;
    const ex = exercises[currentIndex];
    currentKeyRef.current = `${ex.id}-${ex.fen}-${ex.from}-${ex.to}`;
    
    // We do NOT reset state here anymore, it is handled atomically in handleNext / init
    // But on mount or try again, we might need to load
    loadExercise(currentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, isComplete]); // currentEx, engineClient intentionally omitted to prevent double triggering

  if (isComplete) {
    const sessionRecords = getAllRecords().filter(r => r.sessionId === sessionId);
    
    // Compute summary correctly
    // g = graded first attempts, c = correct first attempts, n = not sure first attempts
    const firstAttempts = exercises.map(ex => sessionRecords.find(r => r.exerciseId === ex.id && r.attempt === 1)).filter(Boolean) as any[];
    
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
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        <h2>Session Complete</h2>
        <p>{c} of {g} correct</p>
        <p>{n} not sure</p>
        
        <ul style={{ margin: '20px 0' }}>
          {firstAttempts.map((r, i) => (
            <li key={i}>
              {r.exerciseId}: {r.answer} (Actual: {r.correctLabel})
            </li>
          ))}
        </ul>

        <button onClick={onExit} style={{ marginRight: '10px' }}>Home</button>
        <button onClick={onTrainAgain || onExit} style={{ marginRight: '10px' }}>Train again</button>
        <button onClick={handleDownload}>Download my results</button>
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
      answer: selectedAnswer as any,
      confidence,
      correctLabel: result.label,
      correct: isCorrect,
      msToAnswer,
      timestamp: new Date().toISOString()
    });
    
    setSubmitted(true);
    // Prefetch next
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

  const handleRetryLoad = () => {
    const key = `${currentEx.id}-${currentEx.fen}-${currentEx.from}-${currentEx.to}`;
    delete prefetchCache.current[key]; // force fresh request
    loadExercise(currentIndex);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      <header style={{ padding: '10px', background: '#eee', display: 'flex', justifyContent: 'space-between' }}>
        <strong>Chess Training System</strong>
        <button onClick={onExit}>Exit Training</button>
      </header>
      <div style={{ background: '#1a1a1a', color: '#fff', padding: '10px', textAlign: 'center' }}>
        TRAINING · Exercise {currentIndex + 1} of {exercises.length} · Answer hidden until you submit
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', flex: 1, padding: '4px' }}>
        <div style={{ flex: '1 1 352px', maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {!loading && !engineError && loadedExerciseKey === `${currentEx.id}-${currentEx.fen}-${currentEx.from}-${currentEx.to}` && (
            <>
              <div style={{ alignSelf: 'flex-end', marginBottom: '8px' }}>
                <button onClick={() => setUserFlipped(!displayFlipped)}>Flip Board</button>
              </div>
              {expandedLevel >= 3 && exchangeStep > 0 && submitted && result?.exchange && (
                <div style={{ textAlign: 'center', marginBottom: '8px', fontWeight: 'bold' }}>
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
                 <div style={{ marginTop: '10px', width: '100%', display: 'flex', justifyContent: 'center' }}>
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

        <div style={{ flex: '1 1 300px', padding: '20px', background: '#f9f9f9', margin: '4px' }}>
          {loading || (!engineError && loadedExerciseKey !== `${currentEx.id}-${currentEx.fen}-${currentEx.from}-${currentEx.to}`) ? (
            <h2>Loading exercise…</h2>
          ) : engineError ? (
            <div>
              <h2 aria-live="polite">An error occurred while loading this exercise.</h2>
              <button onClick={handleRetryLoad}>Retry</button>
            </div>
          ) : (
            <>
              <h2 aria-live="polite">{submitted ? feedback : questionText}</h2>
              
              {!submitted && (
                <div style={{ marginTop: '20px' }}>
                  <div role="radiogroup" aria-label="Your prediction" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Object.entries(BADGE_INFO).map(([key, info]) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', padding: '10px', background: selectedAnswer === key ? '#e0e0e0' : '#fff', border: '1px solid #ccc', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="prediction"
                          value={key}
                          checked={selectedAnswer === key}
                          onChange={() => setSelectedAnswer(key)}
                          style={{ marginRight: '10px' }}
                        />
                        {info.text} {info.icon}
                      </label>
                    ))}
                    <label style={{ display: 'flex', alignItems: 'center', padding: '10px', background: selectedAnswer === 'not_sure' ? '#e0e0e0' : '#fff', border: '1px solid #ccc', cursor: 'pointer', marginTop: '10px' }}>
                      <input
                        type="radio"
                        name="prediction"
                        value="not_sure"
                        checked={selectedAnswer === 'not_sure'}
                        onChange={() => setSelectedAnswer('not_sure')}
                        style={{ marginRight: '10px' }}
                      />
                      Not sure
                    </label>
                  </div>

                  {selectedAnswer && (
                    <div style={{ marginTop: '20px' }}>
                      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                        <legend style={{ fontWeight: 'bold', marginBottom: '10px' }}>Confidence (optional):</legend>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          {['Low', 'Medium', 'High'].map(lvl => {
                            const val = lvl.toLowerCase() as any;
                            return (
                              <label key={lvl} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', background: confidence === val ? '#e0e0e0' : '#fff', border: '1px solid #ccc', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name="confidence"
                                  value={val}
                                  checked={confidence === val}
                                  onChange={() => setConfidence(val)}
                                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
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
                    style={{ marginTop: '20px', width: '100%', padding: '15px', background: selectedAnswer ? '#004d40' : '#ccc', color: '#fff', border: 'none', cursor: selectedAnswer ? 'pointer' : 'default' }}
                  >
                    Submit
                  </button>
                </div>
              )}

              {submitted && result && (
                <div style={{ marginTop: '20px' }}>
                  <ResultPanel
                    selectedDestInfo={result}
                    expandedLevel={expandedLevel}
                    setExpandedLevel={setExpandedLevel}
                    exchangeStep={exchangeStep}
                    setExchangeStep={setExchangeStep}
                    stepText={getStepText(result, exchangeStep)}
                  />

                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button onClick={handleNext} style={{ padding: '10px', flex: 1, background: '#004d40', color: '#fff', border: 'none', cursor: 'pointer' }}>
                      Next
                    </button>
                    <button onClick={handleTryAgain} style={{ padding: '10px', flex: 1, background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}>
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
