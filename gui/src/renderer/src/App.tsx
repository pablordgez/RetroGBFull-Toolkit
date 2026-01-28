import {HashRouter, Route, Routes} from "react-router-dom";
import { TemporaryHub } from "./components/TemporaryHub";
import { SpriteEditor } from "./components/SpriteEditor/SpriteEditor";
import { TilesetEditor } from "./components/Tileset/TilesetEditor";
import { TilemapEditor } from "./components/TilemapEditor/TilemapEditor";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<TemporaryHub />} />
        <Route path="/sprite-editor" element={<SpriteEditor />} />
        <Route path="/tileset-editor" element={<TilesetEditor />} />
        <Route path="/tilemap-editor" element={<TilemapEditor />} />
      </Routes>
    </HashRouter>
  )
}

export default App;