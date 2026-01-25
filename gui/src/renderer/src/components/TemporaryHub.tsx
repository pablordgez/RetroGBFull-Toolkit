import { useState } from 'react'

export const TemporaryHub = () => {
  const [displayText, setDisplayText] = useState('');

  const handleButtonClick = async () => {
    setDisplayText('Hello World');    
  };

  const openSpriteEditor = () => {
    window.electron.ipcRenderer.send('open-sprite-editor-window');
  }

  const openTilesetEditor = () => {
      window.electron.ipcRenderer.send('open-tileset-editor-window');
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>My Electron App</h1>
      
      <button onClick={handleButtonClick}>
        Click Me
      </button>

      <h2 style={{ color: 'blue' }}>{displayText}</h2>

      <button onClick={openSpriteEditor} style={{ marginTop: '20px' }}>
        Open Sprite Editor
      </button>

      <button onClick={openTilesetEditor} style={{ marginTop: '20px', marginLeft: '10px' }}>
        Open Tileset Editor
      </button>

    </div>
  );
}
