import React, { useState, useEffect } from 'react';
import './UserModal.css';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type UserMode = 'login' | 'register';

const UserModal: React.FC<UserModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<UserMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState('');

  // 检查用户是否已登录
  useEffect(() => {
    const checkLoginStatus = async () => {
      const storedUser = await chrome.storage.local.get(['currentUser']);
      if (storedUser.currentUser) {
        setIsLoggedIn(true);
        setCurrentUser(storedUser.currentUser);
      }
    };
    
    if (isOpen) {
      checkLoginStatus();
    }
  }, [isOpen]);

  const handleModeToggle = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setStatusMessage('');
  };

  const validateForm = (): boolean => {
    // 简单的表单验证
    if (!username.trim()) {
      setStatusMessage('请输入用户名');
      return false;
    }
    
    if (!password.trim()) {
      setStatusMessage('请输入密码');
      return false;
    }
    
    if (mode === 'register') {
      if (password !== confirmPassword) {
        setStatusMessage('两次输入的密码不一致');
        return false;
      }
      
      if (password.length < 6) {
        setStatusMessage('密码长度至少为6个字符');
        return false;
      }
    }
    
    return true;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;
    
    try {
      setStatusMessage('正在连接服务器...');
      
      // 发送登录请求到后端
      const response = await fetch('http://localhost:5000/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setStatusMessage('登录成功！');
        setIsLoggedIn(true);
        setCurrentUser(username);
        
        // 保存登录状态到本地存储
        await chrome.storage.local.set({ 
          currentUser: username,
          userToken: data.token // 假设后端返回了token
        });
        
        // 延迟关闭窗口
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        // 明确显示"错误的账号或密码"
        setStatusMessage(data.message || '错误的账号或密码');
      }
    } catch (error) {
      console.error('Login error:', error);
      setStatusMessage('连接服务器失败，请确保后端服务器已启动 (http://localhost:5000)');
    }
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    
    try {
      setStatusMessage('正在连接服务器...');
      
      // 发送注册请求到后端
      const response = await fetch('http://localhost:5000/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setStatusMessage('注册成功！现在您可以登录了。');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      } else {
        setStatusMessage(data.message || '注册失败，请稍后再试');
      }
    } catch (error) {
      console.error('Registration error:', error);
      setStatusMessage('连接服务器失败，请确保后端服务器已启动 (http://localhost:5000)');
    }
  };

  const handleLogout = async () => {
    // 清除登录状态
    await chrome.storage.local.remove(['currentUser', 'userToken']);
    setIsLoggedIn(false);
    setCurrentUser('');
    setStatusMessage('已成功退出登录');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content user-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isLoggedIn ? '用户信息' : (mode === 'login' ? '登录' : '注册')}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {isLoggedIn ? (
            <div className="user-profile">
              <div className="welcome-message">
                <p>欢迎，<strong>{currentUser}</strong>！</p>
              </div>
              <div className="user-stats">
                <p>使用统计：</p>
                <ul>
                  <li>处理文本数：0</li>
                  <li>重写单词数：0</li>
                  <li>账户类型：免费版</li>
                </ul>
              </div>
              <button className="logout-button" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="username">用户名</label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password">密码</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                />
              </div>
              
              {mode === 'register' && (
                <div className="form-group">
                  <label htmlFor="confirm-password">确认密码</label>
                  <input
                    type="password"
                    id="confirm-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="请再次输入密码"
                  />
                </div>
              )}
              
              {statusMessage && (
                <div className={`status-message ${statusMessage.includes('成功') ? 'success' : 'error'}`}>
                  {statusMessage}
                </div>
              )}
              
              <div className="form-actions">
                <button 
                  type="submit" 
                  className="submit-button"
                >
                  {mode === 'login' ? '登录' : '注册'}
                </button>
                
                <button 
                  type="button" 
                  className="toggle-mode-button"
                  onClick={handleModeToggle}
                >
                  {mode === 'login' ? '没有账号？立即注册' : '已有账号？立即登录'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserModal; 