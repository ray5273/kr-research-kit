(function() {
  'use strict';
  const format=v=>v.toLocaleString('ko-KR',{maximumFractionDigits:2});
  document.querySelectorAll('[data-calculator]').forEach(section=>{
    const c=JSON.parse(section.querySelector('[data-calculator-config]').textContent), form=section.querySelector('form'), output=section.querySelector('output');
    function update() {
      const values=c.variables.map(v=>Number(form.elements.namedItem(v.key).value));
      if(!form.checkValidity() || values.some(v=>!Number.isFinite(v))) {output.textContent='표시된 범위와 입력 간격 안의 숫자를 입력하세요.';return;}
      const r=ResearchScenario.calculate(c,...values);
      output.textContent=`설명용 연간 영업이익 ${format(r.profit)}억원${r.profit<=0?' · 적자로 배수 가치평가 적용 불가':''}`;
      const valuation=section.querySelector('[data-valuation-output]');
      if(valuation) valuation.textContent=r.profit<=0?'적자로 배수 가치평가 적용 불가':`가정 배수 적용 기업가치 ${format(r.enterpriseValue)}억원 · 순차입금 차감 후 지분가치 ${format(r.equityValue)}억원${r.requiredProfit===null?'':` · 같은 조건의 가격 역산 이익 ${format(r.requiredProfit)}억원`}`;
    }
    form.addEventListener('input',update);
    form.addEventListener('submit',event=>event.preventDefault());
    form.addEventListener('reset',()=>{setTimeout(update,0);});
    update();
  });
})();
