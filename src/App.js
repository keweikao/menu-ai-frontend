import React, { useState } from 'react';

function App() {
  const [token, setToken] = useState('');
  const [file, setFile] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');

  const backendUrl = 'https://your-backend-url'; // 替換成你的後端網址

  const handleLogin = () => {
    window.location.href = `${backendUrl}/auth/google`;
  };

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('extraInfo', 'some extra info');
    const res = await fetch(`${backendUrl}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    alert(data.message);
  };

  const handleChat = async () => {
    const res = await fetch(`${backendUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ prompt, history: [] })
    });
    const data = await res.json();
    setResponse(JSON.stringify(data, null, 2));
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>菜單優化助手</h1>
      <button onClick={handleLogin}>Google 登入</button>
      <br /><br />
      <input type="file" onChange={e => setFile(e.target.files[0])} />
      <button onClick={handleUpload}>上傳菜單</button>
      <br /><br />
      <textarea rows="4" cols="50" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="輸入你的問題或指示"></textarea>
      <button onClick={handleChat}>送出給 Gemini</button>
      <pre>{response}</pre>
    </div>
  );
}

export default App;