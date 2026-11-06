(function(){
  document.querySelectorAll('[data-preview-copy]').forEach(button=>button.addEventListener('click',async()=>{
    const status=button.closest('.sharing').querySelector('[role="status"]');
    try {await navigator.clipboard.writeText(location.href);status.textContent='프리뷰 링크를 복사했습니다.';}
    catch {status.textContent='복사하지 못했습니다. 주소창의 링크를 복사해 주세요.';}
  }));
  // Built URLs name the production host, which has no files for an unmerged
  // change yet, so point images and links at this preview instead.
  const sharing=document.querySelector('.sharing[data-url]');
  const here=value=>{if(!sharing)return value;const base=new URL(sharing.dataset.url).origin;return value.split(base).join(location.origin);};
  let digest=null;
  try {digest=JSON.parse(document.querySelector('#share-digest')?.textContent||'null');} catch {}
  document.querySelectorAll('[data-preview-digest]').forEach(button=>button.addEventListener('click',async()=>{
    const status=button.closest('.sharing').querySelector('[role="status"]');
    try {
      const blob=(value,type)=>new Blob([here(value)],{type});
      await navigator.clipboard.write([new ClipboardItem({'text/html':blob(digest.html,'text/html'),'text/plain':blob(digest.text,'text/plain')})]);
      status.textContent='요약과 링크를 복사했습니다(프리뷰 주소). 네이버 블로그에 붙여넣어 보세요.';
    } catch {status.textContent='복사하지 못했습니다. Chrome에서 다시 시도해 주세요.';}
  }));
  document.querySelectorAll('[data-preview-thumbnail]').forEach(button=>button.addEventListener('click',async()=>{
    const status=button.closest('.sharing').querySelector('[role="status"]');
    try {
      const url=here(sharing.dataset.naverImage),r=await fetch(url);
      if(!r.ok) throw Error();
      const link=document.createElement('a');
      link.href=URL.createObjectURL(await r.blob());
      link.download=new URL(url).pathname.split('/').pop();
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(link.href),1000);
      status.textContent='썸네일을 저장했습니다. 블로그 에디터에 올리고 대표 이미지로 지정해 주세요.';
    } catch {status.textContent='썸네일을 불러오지 못했습니다.';}
  }));
})();
