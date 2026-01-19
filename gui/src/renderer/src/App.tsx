import {HashRouter, Route, Routes} from "react-router-dom";
import { TemporaryHub } from "./components/TemporaryHub";
import { SpriteEditor } from "./components/SpriteEditor/SpriteEditor";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<TemporaryHub />} />
        <Route path="/sprite-editor" element={<SpriteEditor />} />
      </Routes>
    </HashRouter>
  )
}

export default App;