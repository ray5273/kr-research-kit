const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scenario=require('./scenario');
class Element {
  constructor(){this.listeners={};this.textContent='';}
  addEventListener(k,f){this.listeners[k]=f;}
}
const config={price:300,baseProfit:800,multiple:20,netDebt:30000,marketCap:150230,variables:[{key:'volume'},{key:'margin'}]};
function boot(){
  const form=new Element(),output=new Element(),valuation=new Element(),section=new Element();
  const fields={volume:{value:'100'},margin:{value:'5'}};let valid=true;
  form.elements={namedItem:k=>fields[k]};form.checkValidity=()=>valid;
  section.querySelector=s=>s==='form'?form:s==='output'?output:s==='[data-valuation-output]'?valuation:{textContent:JSON.stringify(config)};
  const context={document:{querySelectorAll:s=>s==='[data-calculator]'?[section]:[]},ResearchScenario:scenario,setTimeout:f=>f()};
  vm.runInNewContext(fs.readFileSync(__dirname+'/research-client.js','utf8'),context);
  return {form,output,valuation,fields,setValid:v=>valid=v};
}
const app=boot();
assert.match(app.output.textContent,/2,300억원/);
app.fields.volume.value='120';app.form.listeners.input();assert.match(app.valuation.textContent,/22,000억원/);
app.setValid(false);app.fields.volume.value='99999';app.form.listeners.input();assert.match(app.output.textContent,/범위/);
app.setValid(true);app.fields.volume.value='100';app.fields.margin.value='5';app.form.listeners.reset();assert.match(app.valuation.textContent,/16,000억원/);
app.fields.volume.value='100';app.fields.margin.value='-10';app.form.listeners.input();assert.match(app.output.textContent,/적자로/);
console.log('research client tests passed: calculator bounds/reset/loss');
