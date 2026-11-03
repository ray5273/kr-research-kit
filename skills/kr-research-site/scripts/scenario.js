(function(root) {
  'use strict';
  function calculate(c,volume,margin) {
    const profit=volume*c.price*margin/100+c.baseProfit;
    return {profit,enterpriseValue:profit*c.multiple,equityValue:profit*c.multiple-c.netDebt,requiredProfit:c.marketCap===null?null:(c.marketCap+c.netDebt)/c.multiple};
  }
  if(typeof module==='object') module.exports={calculate};
  else root.ResearchScenario={calculate};
})(typeof globalThis==='object'?globalThis:this);
