import { useState } from 'react';
import { incrementCounter } from './counterLogic';

function App() {
  const [displayText, setDisplayText] = useState('');
  const [counter, setCounter] = useState(0);

  const handleButtonClick = async () => {
    setDisplayText('Hello World');    
    incrementCounter();
    const newBackendCount = await window.api.triggerBackendCounter();
    setCounter(newBackendCount);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>My Electron App</h1>
      
      <button onClick={handleButtonClick}>
        Click Me
      </button>

      <h2 style={{ color: 'blue' }}>{displayText}</h2>
      <h2 style={{ color: 'green' }}>Counter: {counter}</h2>
    </div>
  );
}

export default App;