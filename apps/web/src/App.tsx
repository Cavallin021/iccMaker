import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CanticosPicker } from './pages/CanticosPicker';
import { Studio } from './pages/Studio';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CanticosPicker />} />
        <Route path="/studio" element={<Studio />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
