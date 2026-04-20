import { HashRouter, Route, Routes } from 'react-router-dom'
import { ProjectLauncher } from './components/ProjectLauncher/ProjectLauncher'
import { ProjectWorkspace } from './components/ProjectWorkspace/ProjectWorkspace'
import { SaveDataEditor } from './components/SaveDataEditor/SaveDataEditor'
import { ScriptEditor } from './components/ScriptEditor/ScriptEditor'
import { SpriteEditor } from './components/SpriteEditor/SpriteEditor'
import { TilesetEditor } from './components/Tileset/TilesetEditor'
import { TilemapEditor } from './components/TilemapEditor/TilemapEditor'
import { WindowEditor } from './components/TilemapEditor/WindowEditor'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ProjectLauncher />} />
        <Route path="/project-editor" element={<ProjectWorkspace />} />
        <Route path="/save-data-editor" element={<SaveDataEditor />} />
        <Route path="/script-editor" element={<ScriptEditor />} />
        <Route path="/sprite-editor" element={<SpriteEditor />} />
        <Route path="/tileset-editor" element={<TilesetEditor />} />
        <Route path="/tilemap-editor" element={<TilemapEditor />} />
        <Route path="/window-editor" element={<WindowEditor />} />
      </Routes>
    </HashRouter>
  )
}

export default App
