(() => {
  'use strict';

  const msgEl = document.getElementById('login-msg');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  function showMsg(text, isError) {
    msgEl.textContent = text;
    msgEl.className = `login-msg ${isError ? 'error' : 'ok'}`;
  }

  function switchTab(showRegister) {
    tabLogin.classList.toggle('active', !showRegister);
    tabRegister.classList.toggle('active', showRegister);
    formLogin.hidden = showRegister;
    formRegister.hidden = !showRegister;
    msgEl.textContent = '';
    msgEl.className = 'login-msg';
  }

  tabLogin.addEventListener('click', () => switchTab(false));
  tabRegister.addEventListener('click', () => switchTab(true));

  async function submitJson(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
    return body;
  }

  formLogin.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await submitJson('/api/auth/login', {
        email: document.getElementById('login-email').value.trim(),
        password: document.getElementById('login-password').value
      });
      window.location.href = '/';
    } catch (error) {
      showMsg(error.message, true);
    }
  });

  formRegister.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await submitJson('/api/auth/register', {
        email: document.getElementById('register-email').value.trim(),
        password: document.getElementById('register-password').value
      });
      showMsg('Cuenta creada. Entrando...', false);
      window.location.href = '/';
    } catch (error) {
      showMsg(error.message, true);
    }
  });
})();
