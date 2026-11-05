(() => {
  if (location.hostname === 'prepaid1215.github.io') return;
  const row = document.getElementById('installRow');
  const button = document.getElementById('installButton');
  const dialog = document.getElementById('installDialog');
  const steps = document.getElementById('installSteps');
  const intro = document.getElementById('installIntro');
  const standalone = matchMedia('(display-mode: standalone)');
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let pendingPrompt = null;
  let installed = false;
  const sync = () => { row.hidden = installed || standalone.matches || navigator.standalone === true; };
  sync();
  standalone.addEventListener('change', sync);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
    sync();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = null;
    sync();
    if (dialog.open) dialog.close();
  });
  function showGuide() {
    const android = /Android/.test(navigator.userAgent);
    intro.textContent = isIOS ? 'Safari에서 BP파인더를 열고 아래 순서로 추가해 주세요.' :
      android ? 'Chrome 또는 삼성 인터넷에서 아래 순서로 추가해 주세요.' :
      '브라우저 메뉴에서 BP파인더를 앱으로 설치할 수 있습니다.';
    const labels = isIOS ? ['Safari의 공유 버튼을 누르세요.', '‘홈 화면에 추가’를 선택하세요.', '오른쪽 위 ‘추가’를 누르세요.'] :
      android ? ['브라우저 메뉴(⋮ 또는 ☰)를 여세요.', '‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택하세요.', '‘추가’ 또는 ‘설치’를 누르세요.'] :
      ['Chrome 또는 Edge에서 새 주소를 여세요.', '주소창의 설치 아이콘이나 메뉴의 ‘앱 설치’를 선택하세요.', '설치 메뉴가 없으면 즐겨찾기에 추가해 주세요.'];
    steps.replaceChildren(...labels.map(label => {
      const item = document.createElement('li');
      item.textContent = label;
      return item;
    }));
    dialog.showModal();
  }
  button.addEventListener('click', async () => {
    if (pendingPrompt) {
      const prompt = pendingPrompt;
      pendingPrompt = null;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') { installed = true; sync(); }
        return;
      } catch (_) { /* Browser declined the native prompt; offer manual steps. */ }
    }
    showGuide();
  });
  document.getElementById('installClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
})();
