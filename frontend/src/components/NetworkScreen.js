import React from 'react';
import UniverseNetworkVisualization from './UniverseNetworkVisualization';

function NetworkScreen({ onBack }) {
  return (
    <UniverseNetworkVisualization
      mode="display"
      autoRotate={true}
      onClose={onBack}
    />
  );
}

export default NetworkScreen;
