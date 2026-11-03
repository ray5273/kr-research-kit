(function(){
  document.querySelectorAll('[data-preview-copy]').forEach(button=>button.addEventListener('click',async()=>{
    const status=button.closest('.sharing').querySelector('[role="status"]');
    try {await navigator.clipboard.writeText(location.href);status.textContent='프리뷰 링크를 복사했습니다.';}
    catch {status.textContent='복사하지 못했습니다. 주소창의 링크를 복사해 주세요.';}
  }));
})();
