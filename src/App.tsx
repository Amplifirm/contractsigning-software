import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import PDFDocumentSigner from './pages/Home';
import InternalSigning from './pages/InternalSigning';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<PDFDocumentSigner />} />
          <Route path="/internal-signing" element={<InternalSigning />} />
          {/* <Route path="/signup" element={<SignupPage />} /> */}
          {/* <Route path="/dashboard" element={<Dashboard />} /> */}
          {/* <Route path="/profile" element={<ProfilePage />} /> */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;