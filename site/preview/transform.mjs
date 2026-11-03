// Pure HTML transform: production controls must never pretend to work on static preview.
export function previewHtml(html) {
  html=html.replace(/<meta name="robots" content="[^"]*">/g,'<meta name="robots" content="noindex,nofollow">');
  for(const script of ['analytics.js','engagement.js','card-counts.js']) html=html.replace(new RegExp(`<script src="/${script.replace('.', '\\.')}" defer></script>`,'g'),'');
  html=html.replace(/<section class="comments more"[\s\S]*?<\/section>\s*<a[^>]*id="comment-jump"[^>]*>[\s\S]*?<\/a>/g,'<section id="comments" class="more"><h2>댓글</h2><p class="sub">프리뷰에서는 댓글을 작성하거나 조회할 수 없습니다.</p></section>');
  html=html.replace(/ · <span data-share-count[^>]*>[\s\S]*?<\/span> · <a[^>]*data-comment-count[^>]*>[\s\S]*?<\/a>/g,'');
  html=html.replace(/<div class="share-buttons"[^>]*>[\s\S]*?<\/div>/g,'<div class="share-buttons"><button type="button" data-preview-copy>프리뷰 링크 복사</button></div>');
  html=html.replace(/<p class="sub">공유 횟수는 사이트 공유 기능[\s\S]*?<\/p>/g,'');
  html=html.replace(/<button type="button" data-stats-settings>통계 설정<\/button>/g,'');
  html=html.replace('<main id="main">','<main id="main"><p class="wrap sub" style="padding-top:12px">미리보기 · 기업 이력·계산기를 확인할 수 있습니다. 댓글·공유 집계는 제공하지 않습니다.</p>');
  return html.replace('</body>','<script src="/preview-client.js" defer></script></body>');
}
