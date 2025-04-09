import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios'; // Using axios for progress tracking

// Simple Markdown parsing (replace with a library like 'marked' or 'react-markdown' for better rendering)
function SimpleMarkdown({ text }) {
    if (!text) return null;
    // Basic replacements, very limited
    const html = text
        .replace(/</g, '<') // Escape HTML tags first
        .replace(/>/g, '>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')       // Italic
        .replace(/`([^`]+)`/g, '<code>$1</code>')     // Inline code
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>') // Code block
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')      // H1
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')     // H2
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')    // H3
        .replace(/^\* (.*$)/gm, '<li>$1</li>')     // List item (basic)
        .replace(/\n/g, '<br />');                 // Newlines

    // Wrap list items
    const wrappedHtml = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>').replace(/<\/ul>\s*<ul>/gs, '');

    return <div dangerouslySetInnerHTML={{ __html: wrappedHtml }} />;
}


function App() {
  const [token, setToken] = useState(localStorage.getItem('jwtToken') || null);
  const [userEmail, setUserEmail] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]); // { sender: 'user'/'ai', content: '...' }
  const [currentMessage, setCurrentMessage] = useState('');
  const [error, setError] = useState('');
  const [finalReport, setFinalReport] = useState(''); // State for the final report

  const messagesEndRef = useRef(null); // Ref for scrolling chat

  // --- Backend URL ---
  // Use environment variable provided by build process or default
  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001'; // Default for local dev

  // --- Authentication ---
  useEffect(() => {
    // Check for token in URL after redirect from Google
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const authError = urlParams.get('error');

    if (authError) {
        setError('Google登入失敗，請重試。');
        // Clean URL
        window.history.replaceState({}, document.title, "/");
    } else if (tokenFromUrl) {
      console.log("Token received from URL");
      localStorage.setItem('jwtToken', tokenFromUrl);
      setToken(tokenFromUrl);
      // Clean URL
      window.history.replaceState({}, document.title, "/");
    } else if (token) {
      // Validate existing token and fetch user info
      fetchUserInfo(token);
    }
  }, [token]); // Re-run if token changes

  const fetchUserInfo = useCallback(async (currentToken) => {
    if (!currentToken) return;
    console.log("Fetching user info with token:", currentToken);
    try {
      const response = await axios.get(`${backendUrl}/api/user/me`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      setUserEmail(response.data.email);
      setError(''); // Clear previous errors
      console.log("User info fetched:", response.data.email);
    } catch (err) {
      console.error("Failed to fetch user info:", err);
      // Token might be invalid or expired
      handleLogout();
      setError('登入驗證失敗，請重新登入。');
    }
  }, [backendUrl]); // Include backendUrl in dependencies

  useEffect(() => {
      if (token) {
          fetchUserInfo(token);
      }
  }, [token, fetchUserInfo]); // Fetch user info when token is set


  const handleLogin = () => {
    // Redirect to backend Google auth endpoint
    window.location.href = `${backendUrl}/auth/google`;
  };

  const handleLogout = () => {
    localStorage.removeItem('jwtToken');
    setToken(null);
    setUserEmail('');
    setMessages([]);
    setConversationId(null);
    setError('');
    setFinalReport('');
    // Optionally redirect to home or refresh
    window.location.href = '/'; // Or just clear state without redirect
  };

  // --- File Handling & Upload ---
  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setUploadProgress(0); // Reset progress
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('請先選擇要上傳的菜單檔案。');
      return;
    }
    if (!token) {
      setError('請先登入。');
      return;
    }

    const formData = new FormData();
    formData.append('menuFile', selectedFile); // Match backend 'menuFile'

    setIsUploading(true);
    setError('');
    setMessages([]); // Clear previous messages on new upload
    setConversationId(null);
    setFinalReport('');

    try {
      const response = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      console.log("Upload response:", response.data);
      setConversationId(response.data.conversationId);
      // Add initial AI response to messages
      setMessages([{ sender: 'ai', content: response.data.initialResponse }]);
      setSelectedFile(null); // Clear file input after successful upload

    } catch (err) {
      console.error('Upload failed:', err.response ? err.response.data : err.message);
      setError(`上傳或初步分析失敗: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0); // Reset progress bar
    }
  };

  // --- Chat Handling ---
   const handleSendMessage = async () => {
    if (!currentMessage.trim() || !conversationId) {
        setError(conversationId ? '請輸入訊息。' : '請先上傳菜單以開始對話。');
        return;
    }
    if (isLoadingResponse) return; // Prevent sending while waiting

    const userMessage = { sender: 'user', content: currentMessage };
    setMessages(prev => [...prev, userMessage]); // Display user message immediately
    setCurrentMessage(''); // Clear input
    setIsLoadingResponse(true);
    setError('');
    setFinalReport(''); // Clear final report when continuing chat

    try {
        const response = await axios.post(`${backendUrl}/api/chat`,
            { conversationId, message: userMessage.content },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const aiMessage = { sender: 'ai', content: response.data.response };
        setMessages(prev => [...prev, aiMessage]); // Add AI response
    } catch (err) {
        console.error('Chat failed:', err.response ? err.response.data : err.message);
        setError(`訊息傳送失敗: ${err.response?.data?.error || err.message}`);
        // Optional: Remove the user message if sending failed? Or show error indicator?
    } finally {
        setIsLoadingResponse(false);
    }
  };

  // --- Finalization ---
  const handleFinalize = async () => {
    if (!conversationId) {
        setError('沒有進行中的對話可供彙整。');
        return;
    }
    if (isLoadingResponse) return; // Prevent action while waiting

    setIsLoadingResponse(true);
    setError('');
    setFinalReport('');

    try {
        const response = await axios.post(`${backendUrl}/api/finalize`,
            { conversationId },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        setFinalReport(response.data.finalReport); // Store the final report
        // Optionally add a message indicating finalization
        setMessages(prev => [...prev, { sender: 'ai', content: "已產生最終優化建議報告。" }]);
    } catch (err) {
        console.error('Finalization failed:', err.response ? err.response.data : err.message);
        setError(`產生最終報告失敗: ${err.response?.data?.error || err.message}`);
    } finally {
        setIsLoadingResponse(false);
    }
  };


  // Scroll to bottom of messages when new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Render Logic ---
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>菜單優化助手</h1>
        {token ? (
          <div style={styles.userInfo}>
            <span>{userEmail}</span>
            <button onClick={handleLogout} style={styles.logoutButton}>登出</button>
          </div>
        ) : (
          <button onClick={handleLogin} style={styles.loginButton}>使用 Google 登入</button>
        )}
      </header>

      {error && <p style={styles.error}>{error}</p>}

      {token && (
        <main style={styles.main}>
          {/* Upload Section */}
          <section style={styles.uploadSection}>
            <h2>1. 上傳菜單</h2>
            <input type="file" onChange={handleFileChange} disabled={isUploading} />
            <button onClick={handleUpload} disabled={isUploading || !selectedFile} style={styles.actionButton}>
              {isUploading ? `上傳中... ${uploadProgress}%` : '上傳並開始分析'}
            </button>
            {isUploading && <progress value={uploadProgress} max="100" style={styles.progressBar}></progress>}
          </section>

          {/* Chat Section */}
          {conversationId && (
            <section style={styles.chatSection}>
              <h2>2. 與 AI 對話優化</h2>
              <div style={styles.messageContainer}>
                {messages.map((msg, index) => (
                  <div key={index} style={msg.sender === 'user' ? styles.userMessage : styles.aiMessage}>
                    <SimpleMarkdown text={msg.content} />
                  </div>
                ))}
                {isLoadingResponse && <div style={styles.loading}>AI 回應中...</div>}
                <div ref={messagesEndRef} /> {/* Anchor for scrolling */}
              </div>
              <div style={styles.inputArea}>
                <textarea
                  rows="3"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  placeholder="輸入你的回饋或指示..."
                  disabled={isLoadingResponse}
                  style={styles.textarea}
                />
                <button onClick={handleSendMessage} disabled={isLoadingResponse || !currentMessage.trim()} style={styles.actionButton}>
                  送出訊息
                </button>
              </div>
               <button onClick={handleFinalize} disabled={isLoadingResponse || messages.length === 0} style={{...styles.actionButton, marginTop: '10px'}}>
                  產出最終版本確定
               </button>
            </section>
          )}

          {/* Final Report Section */}
          {finalReport && (
              <section style={styles.finalReportSection}>
                  <h2>最終優化建議報告</h2>
                  <div style={styles.finalReportContent}>
                      <SimpleMarkdown text={finalReport} />
                  </div>
              </section>
          )}

        </main>
      )}
    </div>
  );
}

// --- Basic Styles --- (Consider moving to a CSS file)
const styles = {
  container: { fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: '0 auto', padding: '20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' },
  userInfo: { display: 'flex', alignItems: 'center' },
  logoutButton: { marginLeft: '10px', padding: '5px 10px', cursor: 'pointer' },
  loginButton: { padding: '10px 15px', cursor: 'pointer', backgroundColor: '#4285F4', color: 'white', border: 'none', borderRadius: '4px' },
  error: { color: 'red', border: '1px solid red', padding: '10px', marginBottom: '15px' },
  main: { display: 'flex', flexDirection: 'column', gap: '30px' },
  uploadSection: { border: '1px solid #eee', padding: '15px', borderRadius: '5px' },
  progressBar: { width: '100%', marginTop: '10px' },
  chatSection: { border: '1px solid #eee', padding: '15px', borderRadius: '5px' },
  messageContainer: { height: '400px', overflowY: 'auto', border: '1px solid #ddd', marginBottom: '10px', padding: '10px', background: '#f9f9f9' },
  userMessage: { textAlign: 'right', marginBottom: '10px', marginLeft: '20%' },
  aiMessage: { textAlign: 'left', marginBottom: '10px', marginRight: '20%', background: '#e9e9ff', padding: '8px', borderRadius: '8px' },
  loading: { fontStyle: 'italic', color: '#777', textAlign: 'center' },
  inputArea: { display: 'flex', gap: '10px' },
  textarea: { flexGrow: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' },
  actionButton: { padding: '10px 15px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' },
  finalReportSection: { border: '1px solid #eee', padding: '15px', borderRadius: '5px', marginTop: '20px', background: '#f0fff0' },
  finalReportContent: { maxHeight: '500px', overflowY: 'auto', border: '1px solid #ddd', padding: '10px', background: 'white' }
};

export default App;
