export function pickPortrait(input,Picker) {
  if(!Picker)throw Error('Foundry’s image picker is unavailable');
  const picker=new Picker({type:'image',current:input.value,callback:path=>{
    input.value=path;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }});
  return picker.browse();
}
