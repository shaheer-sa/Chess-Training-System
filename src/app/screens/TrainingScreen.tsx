import React, { useState, useEffect, useRef } from 'react';
import { EngineClient } from '../engine/EngineClient.js';
import { Exercise } from '../training/exercises.js';
import { Board } from '../components/Board.js';
import { ResultPanel } from '../components/ResultPanel.js';
import { Chess, fen as fenOps } from 'chessops';
import { BADGE_INFO } from '../shared/badgeInfo.js';
import { MoveClassification } from '../../engine/types.js';
import { appendRecord, generateSessionId, getAllRecords } from '../training/records.js';

interface TrainingScreenProps {
  engineClient: EngineClient;
  exercises: Exercise[];
  onExit: () => void;
}

export default function TrainingScreen({ engineClient, exercises, onExit }: TrainingScreenProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionId] = useState(() => generateSessionId());
  
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<MoveClassification | null>(null);
  
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<'low'|'medium'|'high'|null>(null);
  
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(1);
  const [startTime, setStartTime] = useState<number>(0);
  
  const [expandedLevel, setExpandedLevel] = useState(1);
  const [exchangeStep, setExchangeStep] = useState(0);
  
  const [userFlipped, setUserFlipped] = useState<boolean | null>(null);

  const currentEx = exercises[currentIndex];
  const isComplete = currentIndex >= exercises.length;

  useEffect(() => {
    if (isComplete) return;
    let active = true;
    
    setLoading(true);
    setResult(null);
    setSelectedAnswer(null);
    setConfidence(null);
    setSubmitted(false);
    setAttempt(1);
    setExpandedLevel(1);
    setExchangeStep(0);
    setUserFlipped(null);

    engineClient.classifyMove(currentEx.fen, { from: currentEx.from, to: currentEx.to, promotion: currentEx.promotion as any })
      .then(res => {
        if (!active) return;
        if (res.ok) setResult(res.value);
        setLoading(false);
        setStartTime(Date.now());
      });
      
    return () => { active = false; };
  }, [currentIndex, currentEx, engineClient, isComplete]);

  if (isComplete) {
    const records = getAllRecords().filter(r => r.sessionId === sessionId);
    const correctCount = records.filter(r => r.attempt === 1 && r.correct).length;
    
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
        <p>{correctCount} correct on first attempt</p>
        <button onClick={onExit} style={{ marginRight: '10px' }}>Train again</button>
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
      let promo = currentEx.promotion ? ` and promotes to a ${currentEx.promotion}` : '';
      questionText = `${color} plays ${piece.role} ${currentEx.from}→${currentEx.to}${promo}. What happens?`;
    }
  }

  const handleSubmit = () => {
    if (!selectedAnswer || !result) return;
    
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
  };

  const handleTryAgain = () => {
    setAttempt(a => a + 1);
    setSelectedAnswer(null);
    setConfidence(null);
    setSubmitted(false);
    setExpandedLevel(1);
    setExchangeStep(0);
    setStartTime(Date.now());
  };

  let feedback = '';
  if (submitted && result) {
    if (selectedAnswer === 'not_sure') feedback = 'Not graded';
    else if (selectedAnswer === result.label) feedback = 'Correct';
    else {
      const chosenLabel = Object.keys(BADGE_INFO).includes(selectedAnswer) 
        ? BADGE_INFO[selectedAnswer as keyof typeof BADGE_INFO].text 
        : selectedAnswer;
      feedback = `Not quite — you chose ${chosenLabel}`;
    }
  }

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
          <div style={{ alignSelf: 'flex-end', marginBottom: '8px' }}>
            <button onClick={() => setUserFlipped(!displayFlipped)}>Flip Board</button>
          </div>
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
        </div>

        <div style={{ flex: '1 1 300px', padding: '20px', background: '#f9f9f9', margin: '4px' }}>
          {loading ? (
            <h2>Loading exercise…</h2>
          ) : (
            <>
              <h2 aria-live="polite">{submitted ? feedback : questionText}</h2>
              
              {!submitted && (
                <div style={{ marginTop: '20px' }}>
                  <div role="radiogroup" aria-label="Your prediction" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Object.entries(BADGE_INFO).map(([key, info]) => (
                      <button
                        key={key}
                        role="radio"
                        aria-checked={selectedAnswer === key}
                        onClick={() => setSelectedAnswer(key)}
                        style={{ padding: '10px', textAlign: 'left', background: selectedAnswer === key ? '#e0e0e0' : '#fff', border: '1px solid #ccc', cursor: 'pointer' }}
                      >
                        {info.text} {info.icon}
                      </button>
                    ))}
                    <button
                      role="radio"
                      aria-checked={selectedAnswer === 'not_sure'}
                      onClick={() => setSelectedAnswer('not_sure')}
                      style={{ padding: '10px', textAlign: 'left', background: selectedAnswer === 'not_sure' ? '#e0e0e0' : '#fff', border: '1px solid #ccc', cursor: 'pointer' }}
                    >
                      Not sure
                    </button>
                  </div>

                  {selectedAnswer && (
                    <div style={{ marginTop: '20px' }}>
                      <label style={{ fontWeight: 'bold' }}>Confidence (optional):</label>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        {['Low', 'Medium', 'High'].map(lvl => (
                          <button
                            key={lvl}
                            onClick={() => setConfidence(lvl.toLowerCase() as any)}
                            style={{ flex: 1, padding: '8px', background: confidence === lvl.toLowerCase() ? '#e0e0e0' : '#fff', border: '1px solid #ccc', cursor: 'pointer' }}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
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
                    stepText=""
                  />

                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button onClick={() => setCurrentIndex(i => i + 1)} style={{ padding: '10px', flex: 1, background: '#004d40', color: '#fff', border: 'none', cursor: 'pointer' }}>
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
