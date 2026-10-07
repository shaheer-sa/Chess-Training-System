import React from 'react';
import { EngineClient } from '../engine/EngineClient';

interface AnalysisScreenProps {
  engineClient: EngineClient;
  initialFen?: string;
}

export const AnalysisScreen: React.FC<AnalysisScreenProps> = ({ engineClient, initialFen }) => {
  return <div>Analysis Screen Placeholder</div>;
};
